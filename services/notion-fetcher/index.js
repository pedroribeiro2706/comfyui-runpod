const http = require('http');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = '2022-06-28';
const MAX_DEPTH = 10;

async function fetchBlocks(blockId, depth = 0) {
  if (depth > MAX_DEPTH) return [];
  const sections = [];
  let cursor;

  do {
    const qs = `page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children?${qs}`, {
      headers: { Authorization: `Bearer ${NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION },
    });
    if (!res.ok) throw new Error(`Notion ${res.status} for block ${blockId}: ${await res.text()}`);
    const data = await res.json();

    for (const block of data.results) {
      const type = block.type;
      if (type === 'child_page') {
        const children = await fetchBlocks(block.id, depth + 1);
        sections.push({ type: 'section', title: block.child_page.title, blocks: children });
      } else {
        sections.push(block);
        if (block.has_children) {
          const nested = await fetchBlocks(block.id, depth + 1);
          sections.push(...nested);
        }
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return sections;
}

function blocksToText(blocks, depth = 0) {
  return blocks.flatMap(block => {
    if (block.type === 'section') {
      return [
        `\n${'#'.repeat(Math.min(depth + 2, 6))} ${block.title}`,
        blocksToText(block.blocks || [], depth + 1),
      ];
    }
    const content = block[block.type];
    if (content?.rich_text) {
      const text = content.rich_text.map(t => t.plain_text).join('');
      return text.trim() ? [text] : [];
    }
    return [];
  }).join('\n');
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/fetch') {
    res.writeHead(404); res.end(); return;
  }
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { pageId } = JSON.parse(body);
      if (!pageId) throw new Error('pageId é obrigatório');
      if (!NOTION_TOKEN) throw new Error('NOTION_TOKEN não configurado');
      const blocks = await fetchBlocks(pageId);
      if (!blocks.length) throw new Error('Nenhum bloco retornado — verifique permissões da integração');
      const rawLoreText = blocksToText(blocks).replace(/\n{3,}/g, '\n\n').trim();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ rawLoreText, blockCount: blocks.length }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(3000, () => console.log('notion-fetcher running on :3000'));
