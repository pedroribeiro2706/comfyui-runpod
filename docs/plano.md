# tLotD — Plano de Arquitetura (estado atual + próximos passos)

**Última revisão:** 2026-03-09

---

## Estado atual (implementado e estável — NÃO modificar)

### Workflows n8n

| Workflow | ID | Nós | Status | Função |
|---|---|---|---|---|
| `tLotD` | `3wgEcu7GkDL1YhZU` | 23 | ATIVO | Pipeline base (Fase 01) |
| `tLotD-02` | `G5ekS4TSs1HaT3Ed` | 35 | ATIVO | Validador de lore + geração (Fase 02) |
| `tLotD-Lore` | `p0P08ym4kFt7nyJi` | 10 | INATIVO | Ingestão Notion → Postgres |
| `tLotD-DB-Migration` | — | — | Executado | Criação do schema Postgres |

**Regra:** nenhum destes workflows deve ser modificado ou regenerado.

### Pipeline de ingestão (tLotD-Lore)

```
POST /webhook/tLotD-lore-ingest
  → Fetch Lore (HTTP → notion-fetcher:3000/fetch)
      ↓ { rawLoreText, blockCount }
  → Compile with LLM (GPT-4o-mini, structured output json_schema)
  → Split Artifacts (Code — 6 items)
  → Is Markdown? → UPSERT Markdown (Postgres, parametrizado)
               → UPSERT JSON    (Postgres, parametrizado)
  → Merge Results (Append)
  → Verify Upsert (Code — confirma 6 artefatos)
  → Respond 200
```

**Micro-serviço notion-fetcher:** `services/notion-fetcher/` (Node.js 22, sem deps, recursivo, paginado)
- POST `http://notion-fetcher:3000/fetch` → `{ rawLoreText, blockCount }`
- **PENDENTE DEPLOY:** container precisa ser construído e adicionado à rede Docker do n8n

### Pipeline de validação (tLotD-02)

```
POST /webhook/tLotD-02
  → Force Flag? [force=true → pular validação]
  → Extract Entities (GPT-4o-mini, structured output)
  → Parse Entities (Code — decide quais artefatos carregar)
  → Load Canon Artifacts (Postgres — SELECT WHERE artifact_name = ANY($1::text[]))
  → Build Context (Code — formata artefatos seletivamente)
  → Validate with GPT (GPT-4o-mini, structured output)
  → Parse Validation
  → Lore Valid?
      ├─ [approved] → Enhance Prompt → geração de imagem
      └─ [rejected / needs_review] → Build Invalid Response → Return 422
```

**Frontend:** `frontend/index.html` — abas Fase 01 / Fase 02, modal vermelho (rejected), modal amarelo (needs_review).

---

## Schema Postgres

### Tabela `lore_artifacts` (fonte de verdade atual)

```sql
CREATE TABLE IF NOT EXISTS lore_artifacts (
  artifact_name TEXT PRIMARY KEY,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('json', 'markdown')),
  content_json  JSONB,
  content_text  TEXT,
  source_ref    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CHECK (
    (artifact_type = 'json'     AND content_json IS NOT NULL AND content_text IS NULL)
    OR
    (artifact_type = 'markdown' AND content_text IS NOT NULL AND content_json IS NULL)
  )
);
```

### Os 6 artefatos canônicos

| artifact_name | artifact_type | Conteúdo |
|---|---|---|
| `lore_overview` | markdown | Narrativa consolidada do universo (500-800 palavras) |
| `canon_rules` | json | Regras duras: mundos, restrições, magia, espécies, proibições |
| `characters` | json | Personagens: role, faction, status, appearance, traits, aliases |
| `locations` | json | Locais: type, atmosphere, visual_traits, aliases |
| `timeline` | json | Eras e eventos principais |
| `visual_constraints` | json | Restrições visuais: forbidden, style, creature_rules, atmosphere_rules |

---

## Separação de responsabilidades: artefatos vs. lore graph

| Camada | O que é | Onde vive | Quem escreve | Quem lê |
|--------|---------|-----------|-------------|---------|
| **Artefatos canônicos** | Lore compilado em 6 blocos estruturados | `lore_artifacts` (Postgres) | tLotD-Lore (ingestão) + Lore Editor (manual) | tLotD-02 (validador) |
| **Lore Graph** | Entidades tipadas, relacionamentos, timeline granular | Futuro (Postgres relacional ou Neo4j) | Futuro | Futuro |

**Regra:** o Lore Graph é uma evolução futura. Não implementar agora. Os artefatos canônicos são a única fonte de verdade para o validador.

**Motivo da separação:** os artefatos são blocos de texto/JSON compilados — rápidos de carregar, fáceis de enviar para o LLM. O Lore Graph seria um modelo de dados normalizado (entidade Personagem com campos, entidade Local com relacionamentos) — útil para queries estruturadas, mas requer uma camada de acesso diferente. São duas representações complementares do mesmo lore.

---

## Próximo passo: Lore Editor (v2.5)

### Objetivo

Interface web para visualizar e editar manualmente os artefatos em `lore_artifacts`. Funciona como um CMS mínimo — complementa a ingestão automática (que pode sobrescrever edições manuais quando executada novamente).

### Stack proposta

**Next.js 14+ (App Router) + `pg` + Monaco Editor**

| Escolha | Justificativa |
|---|---|
| Next.js App Router | Server Actions = queries Postgres direto, sem API layer extra |
| `pg` (node-postgres) | Schema fixo, 1 tabela, sem migrations — ORM é overkill |
| Monaco Editor | Editor in-browser com syntax highlight para JSON e markdown |
| Tailwind CSS | Estilo mínimo, dark theme consistente com o frontend existente |
| Docker + rede n8n | Deploy consistente com o resto da infra, sem expor Postgres externamente |

**Por que não Prisma:** o schema já existe e não muda. Prisma adiciona geração de cliente, migrations e um layer de abstração sem nenhum benefício para 1 tabela com SELECT + UPDATE.

### Estrutura de rotas

```
/                      → lista os 6 artefatos (nome, tipo, updated_at)
/artifact/[name]       → visualiza e edita o artefato selecionado
```

### Server Actions

```typescript
// lib/db.ts — pool pg compartilhado
// app/actions.ts

getArtifacts()
  SELECT artifact_name, artifact_type, updated_at
  FROM lore_artifacts ORDER BY artifact_name

getArtifact(name: string)
  SELECT artifact_name, artifact_type, content_json, content_text, updated_at
  FROM lore_artifacts WHERE artifact_name = $1

updateArtifact(name: string, content: string)
  -- Para markdown:
  UPDATE lore_artifacts SET content_text = $2, updated_at = now()
  WHERE artifact_name = $1 AND artifact_type = 'markdown'
  -- Para json (valida parse antes de salvar):
  UPDATE lore_artifacts SET content_json = $2::jsonb, updated_at = now()
  WHERE artifact_name = $1 AND artifact_type = 'json'
```

### UX mínima

1. **Página inicial (`/`):** tabela com os 6 artefatos — nome, tipo (badge JSON/MD), data de atualização, botão "Editar"
2. **Página de edição (`/artifact/[name]`):**
   - Header: nome do artefato + tipo + data
   - Monaco Editor ocupando a área principal (JSON com formatação, ou markdown plain)
   - Botão "Salvar" → Server Action → feedback de sucesso/erro
   - Botão "Voltar"
   - Aviso: "Edições manuais podem ser sobrescritas pela próxima ingestão do Notion"

### Validação antes de salvar

- Para `artifact_type = 'json'`: `JSON.parse(content)` no cliente antes de submeter (Monaco já indica erros de sintaxe)
- Para `artifact_type = 'markdown'`: sem validação — qualquer texto é válido

### Deploy

```yaml
# docker-compose.yml (stack n8n no Portainer)
lore-editor:
  build: ./services/lore-editor
  restart: unless-stopped
  ports:
    - "3001:3000"
  environment:
    DATABASE_URL: ${LORE_EDITOR_DATABASE_URL}
  networks:
    - n8n_network
```

- Porta externa 3001
- `DATABASE_URL` no formato `postgresql://user:pass@postgres:5432/dbname`
- Acesso: proteger via nginx reverse proxy com basic auth, ou restringir por IP no Portainer

### Estrutura de arquivos

```
services/lore-editor/
├── Dockerfile
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx              ← lista de artefatos
│   ├── artifact/
│   │   └── [name]/
│   │       └── page.tsx      ← editor de artefato
│   └── actions.ts            ← server actions (getArtifacts, getArtifact, updateArtifact)
└── lib/
    └── db.ts                 ← pool pg
```

---

## Roadmap

### v2.5 — Lore Editor (próximo)
- [ ] Criar `services/lore-editor/` com estrutura Next.js
- [ ] Implementar Server Actions (getArtifacts, getArtifact, updateArtifact)
- [ ] Monaco Editor integrado (JSON + markdown)
- [ ] Deploy Docker no VPS

### v2.6 — Testes end-to-end do validador
- [ ] Deploy notion-fetcher no VPS
- [ ] Testar 3 cenários: rejected, approved, needs_review
- [ ] Ajustar system prompts se necessário

### v3.0 — Geração de Vídeo
- [ ] Aba "Fase 03" no frontend
- [ ] Wan2.1 via RunPod (480p, RTX 4090)

### Lore Graph (longo prazo)
- Modelo de dados normalizado: entidades Personagem, Local, Facção com relacionamentos
- Complementa (não substitui) os artefatos canônicos
- Tecnologia a decidir: Postgres relacional ou Neo4j
