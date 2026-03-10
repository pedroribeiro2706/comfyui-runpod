# tLotD — Memória do Projeto

**Última atualização:** 2026-03-10

Registro objetivo e compilado de tudo o que foi construído no projeto tLotD (The Light of the Darkness) — pipeline de geração de assets com IA para o estúdio Quarto Mundo.

---

## Infraestrutura base

| Componente | Detalhe |
|---|---|
| VPS | Digital Ocean, IP `159.65.244.161` |
| Orquestração | Docker Swarm + Portainer |
| Rede interna | `network_swarm_public` |
| DNS | Registro.br → Hostgator (Zone Editor) → VPS |
| Domínio | `clockdesign.com.br` |
| Repositório | `github.com/pedroribeiro2706/comfyui-runpod` (público) |

**Serviços no Swarm:**

| Stack | Serviço | URL |
|---|---|---|
| `traefik` | Traefik v2.11 (reverse proxy + TLS) | — |
| `n8n_editor` | n8n editor | `workflows-mvp.clockdesign.com.br` |
| `n8n_webhook` | n8n webhook | `webhooks-mvp.clockdesign.com.br` |
| `n8n_worker` | n8n worker | — |
| `postgres` | Postgres 16 | porta 5432 interno |
| `redis` | Redis | interno |
| `portainer` | Portainer | `painel-mvp.clockdesign.com.br` |
| `notion-fetcher` | Micro-serviço Notion | `notion-fetcher:3000` interno |
| `lore-editor` | Lore Editor (Next.js) | `lore-editor.clockdesign.com.br` |

---

## Fase 01 — Pipeline base de geração de imagens ✅

**Workflow n8n:** `tLotD` (ID: `3wgEcu7GkDL1YhZU`, 23 nós)

Fluxo: Webhook → verifica pod RunPod ativo → cria pod se necessário → aguarda ComfyUI → envia prompt → polling resultado → download imagem → responde → aguarda 300s → deleta pod.

**O que foi construído:**
- Imagem Docker GHCR com ComfyUI + DreamShaper XL Turbo (8.3GB)
- Pod reuse: verifica pod `tLotD-comfy` ativo antes de criar novo
- Modelo: `DreamShaperXL_Turbo_dpmppSdeKarras_half_pruned_6.safetensors`
- Observabilidade: headers `X-Total-Time`, `X-Generation-Time`, `X-Seed`, `X-Cost-Per-Hr`, `X-Cost-Usd`
- Frontend: `frontend/index.html` com aba Fase 01, negative prompt, meta-strip, cotação BRL configurável

---

## Fase 02 — Validação de lore com agentes IA ✅

**Workflow n8n:** `tLotD-02` (ID: `G5ekS4TSs1HaT3Ed`, 35 nós)

Fluxo: Webhook → Force Flag? → Extract Entities (GPT-4o-mini) → Parse Entities → Load Canon Artifacts (Postgres) → Build Context → Validate with GPT → Lore Valid? → [approved] Enhance Prompt → pipeline imagem / [rejected/needs_review] Return 422.

**O que foi construído:**
- Extração de entidades do prompt com structured output
- Carregamento seletivo de artefatos canônicos do Postgres
- Validação de coerência com lore canônico real
- Resposta 422 com `{ validated, status, reason, suggestion, lore_references[] }`
- Frontend: aba Fase 02, modal vermelho (rejected), modal amarelo (needs_review), botão "Gerar mesmo assim" com `force: true`

**Nota técnica importante (corrigida):** `ANY($1::text[])` no Postgres não aceita array JS diretamente. Solução: formatar como literal Postgres `{item1,item2}` no Code node anterior.

---

## Ingestão de lore — tLotD-Lore ✅

**Workflow n8n:** `tLotD-Lore` (ID: `p0P08ym4kFt7nyJi`, 10 nós)

Fluxo: Webhook → notion-fetcher (HTTP recursivo) → GPT-4o-mini (structured output, 6 artefatos) → Split → UPSERT Postgres → Verify → Respond.

**Micro-serviço notion-fetcher:** `services/notion-fetcher/` — Node.js 22, sem dependências, recursivo com paginação (depth=10). Deploy no Swarm como `notion-fetcher:3000`.

**Schema Postgres — tabela `lore_artifacts`:**

| artifact_name | artifact_type | Conteúdo |
|---|---|---|
| `lore_overview` | markdown | Narrativa consolidada |
| `canon_rules` | json | Regras duras do universo |
| `characters` | json | Personagens com traits/appearance |
| `locations` | json | Locais com visual_traits |
| `timeline` | json | Eras e eventos |
| `visual_constraints` | json | Restrições visuais para geração |

✅ 6 linhas confirmadas em Postgres após execução do workflow.

---

## Lore Editor ✅

**Serviço:** `services/lore-editor/` — Next.js 14 (App Router), pg, Monaco Editor, Tailwind
**URL:** `https://lore-editor.clockdesign.com.br`
**Deploy:** Docker Swarm, rede `network_swarm_public`, Traefik com TLS automático

**O que foi construído:**
- `lib/db.ts`: pool pg singleton
- `app/actions.ts`: Server Actions (`getArtifacts`, `getArtifact`, `updateArtifact`)
- `app/page.tsx`: lista os 6 artefatos com badges, tipo, data, link editar
- `app/artifact/[name]/editor.tsx`: Monaco Editor com validação JSON antes de salvar, feedback de status
- Dockerfile multi-stage (builder + runner standalone)
- stack.yml para Swarm com Traefik labels

**Decisões de deploy:**
- `export const dynamic = 'force-dynamic'` em `page.tsx` — necessário para evitar static generation em build time sem DATABASE_URL
- `DATABASE_URL` injetado via `docker service update --env-add` — persiste no Swarm, fora do git
- `?sslmode=disable` na connection string — Postgres Docker sem SSL configurado

---

## Padrões e lições aprendidas

**n8n:**
- `sourceOutput`/`targetInput` em `n8n_update_partial_workflow` devem ser strings `"0"`, `"1"`
- IF node branches: usar `branch: "true"/"false"`, não `sourceIndex`
- Novos nós precisam de conexão no mesmo batch (senão: "disconnected nodes detected")
- `rewireConnection` é mais confiável que removeConnection + addConnection

**Docker/Swarm:**
- `docker stack deploy` não suporta `--env-file`; credenciais sensíveis → `docker service update --env-add`
- `node_modules` de Windows são incompatíveis com Linux — nunca copiar via scp; usar git + docker build
- `output: 'standalone'` no Next.js: Dockerfile deve copiar `.next/standalone` E `.next/static`
- Next.js App Router faz static generation em build time por padrão — adicionar `force-dynamic` quando há DB fetch

**Segurança:**
- `.gitignore` cobre `*.env` mas NÃO `*.env.local` — adicionado explicitamente
- `**/.next/` adicionado ao `.gitignore` (build artifacts não vão ao git)
- Credenciais em `stack.yml` substituídas por placeholder `CHANGE_ME` no repositório público

---

## Estado atual (março 2026)

| Componente | Status |
|---|---|
| Fase 01 (pipeline imagem) | ✅ Produção |
| Fase 02 (validação lore) | ✅ Implementado — pendente testes end-to-end |
| tLotD-Lore (ingestão Notion) | ✅ Executado — 6 artefatos no Postgres |
| notion-fetcher | ✅ Deploy no Swarm |
| Lore Editor | ✅ Produção — `lore-editor.clockdesign.com.br` |
| Lore Graph | 🔲 Planejamento |
