# tLotD — Pipeline de Geração de Assets: Estado Atual e Próximos Passos

## Estratégia de organização por fase

Cada fase do projeto tem seu próprio workflow n8n e painel no frontend:

| Fase | Workflow n8n | Aba no frontend | Status |
|---|---|---|---|
| Fase 01 | `tLotD` (ID: `3wgEcu7GkDL1YhZU`) | "Fase 01" | ✅ Produção |
| Fase 02 | `tLotD-02` (ID: `G5ekS4TSs1HaT3Ed`) | "Fase 02 — IA" | 🔧 Em configuração |

---

## Fase 01 — Pipeline Base (v2.2) ✅ Funcional

```
Frontend (HTML, aba Fase 01) → n8n Webhook /tLotD
  → [Pod reuse] Verificar pod ativo → reutilizar OU criar pod RTX 4090
  → Aguardar pod RUNNING (polling /pods/{id} a cada 10s)
  → Aguardar ComfyUI pronto (polling /system_stats a cada 10s)
  → Enviar prompt ao ComfyUI (POST /prompt)
  → Aguardar geração (polling /history a cada 3s)
  → Baixar imagem (GET /view)
  → Retornar imagem ao frontend (com headers de observabilidade)
  → Aguardar 300s → Deletar pod
```

| Detalhe | Valor |
|---|---|
| Modelo | DreamShaper XL Turbo (`DreamShaperXL_Turbo_dpmppSdeKarras_half_pruned_6.safetensors`) |
| Resolução | 1024×1024 |
| KSampler | 28 steps, CFG 6, euler_ancestral, karras |
| GPU | RTX 4090 (fallback: RTX 4080, RTX A6000) |
| Network Volume | `f1yahlb3w9` montado em `/workspace` |
| n8n workflow | `3wgEcu7GkDL1YhZU` (23 nós) |

### O que já foi feito na Fase 01
- ✅ Pipeline end-to-end funcional (webhook → pod → ComfyUI → imagem → resposta)
- ✅ Pod reuse (verifica pod ativo antes de criar novo — ~30-40s na 2ª requisição)
- ✅ DreamShaper XL Turbo no volume (substituiu SD 1.5)
- ✅ Negative prompt dinâmico no frontend e n8n
- ✅ Fix "Terminate Pod" (erro 204 No Content)
- ✅ Observabilidade: headers X-Total-Time, X-Generation-Time, X-Seed, X-Cost-Per-Hr, X-Cost-Usd
- ✅ Frontend com meta-strip (Montagem · Geração · Total · Custo USD/BRL · Seed copiável)
- ✅ Cotação R$/USD configurável no frontend (localStorage)
- ✅ Wait Before Cleanup: 300s (5 min)

### Como testar o pipeline diretamente no ComfyUI

1. Inicie um pod no RunPod manualmente
2. Abra a porta 8188 (botão "Connect" → HTTP 8188)
3. Settings → ative "Enable Dev Mode Options"
4. "Load" → selecione `workflows/comfyui_pipeline.json`
5. Para exportar alterações: "Save (API Format)"

---

## Fase 02 — Agentes de IA (v2.4) ✅ Implementado — aguardando testes

```
Frontend (HTML, aba Fase 02) → n8n Webhook /tLotD-02
  → Set Start Time
  → Force Flag? [force=true → pular validação]
  → [FALSE] Extract Entities (gpt-4o-mini — extrai personagens, locais, eras, etc.)
  → Parse Entities (Code — decide quais artefatos carregar)
  → Load Canon Artifacts (Postgres — SELECT de lore_artifacts)
  → Build Context (Code — formata artefatos em contexto textual)
  → Validate with GPT (gpt-4o-mini — valida coerência com lore canônico)
  → Parse Validation
  → Lore Valid?
      ├─ [approved/needs_review] → Enhance Prompt (gpt-4o-mini)
      └─ [rejected/needs_review] → Build Invalid Response → Return Invalid (422 JSON)
  → Set Enhanced Data
  → [... fluxo idêntico à Fase 01 ...]
  → Build ComfyUI Payload (usa prompt enriquecido)
  → Retornar imagem
```

| Nó | Função |
|---|---|
| Force Flag? | Pula validação se `body.force === true` |
| Extract Entities | gpt-4o-mini extrai entidades do prompt (personagens, locais, eras) |
| Parse Entities | Decide seletivamente quais artefatos de lore carregar |
| Load Canon Artifacts | Postgres SELECT em `lore_artifacts` — só artefatos relevantes |
| Build Context | Formata artefatos em texto estruturado para o validador |
| Validate with GPT | gpt-4o-mini valida com contexto canônico real |
| Build Invalid Response | Constrói payload `{ validated, status, reason, suggestion, lore_references }` |
| Return Invalid | Retorna 422 JSON — frontend exibe modal vermelho (rejected) ou amarelo (needs_review) |

### Workflow auxiliar — tLotD-Lore (ID: p0P08ym4kFt7nyJi)
- Trigger: POST `/webhook/tLotD-lore-ingest`
- Fluxo: notion-fetcher (recursive blocks) → GPT compilador → 6 artefatos → Postgres UPSERT
- Artefatos: `lore_overview`, `canon_rules`, `characters`, `locations`, `timeline`, `visual_constraints`
- ✅ Executado com sucesso — 6 linhas confirmadas em `lore_artifacts`

### Notion Fetcher (micro-serviço)
- `services/notion-fetcher/` — Node.js 22, sem dependências externas
- POST `/fetch` com `{ pageId }` → retorna `{ rawLoreText, blockCount }`
- Busca recursiva de blocos com paginação (até depth=10, page_size=100)
- Roda em container Docker na rede do n8n (hostname: `notion-fetcher`)

### Frontend Fase 02
- Badge "IA Ativa"
- Campo seed (opcional, para reproduzir resultados)
- Ctrl+Enter para gerar
- Modal de lore inválido (rejected): fundo escuro, título dourado, reason + suggestion
- Modal de lore ambíguo (needs_review): título amarelo, mesmo fluxo de force
- "Gerar mesmo assim" reenvia com `force: true`
- Box "Prompt melhorado pela IA" (quando header `X-Enhanced-Prompt` estiver presente)

### Pendências para validar v2.4

**1. Deploy do notion-fetcher:**
- Build e deploy do container `services/notion-fetcher/` no VPS (Docker network do n8n)
- O Fetch Lore node aponta para `http://notion-fetcher:3000/fetch`

**2. Testar 3 cenários:**
- Prompt inválido (ex: "cachorro numa fazenda") → modal vermelho, rejected
- Prompt válido (ex: "Sephius atravessando o Burning Lair") → imagem gerada
- Prompt ambíguo → modal amarelo, needs_review, opção de gerar mesmo assim

---

## Roadmap

### Melhorias v2.3 futuras
- [ ] Refinar system prompts dos agentes com lore real do Notion após testes
- [ ] Adicionar header `X-Enhanced-Prompt` no Respond to Webhook do tLotD-02
- [ ] Select de qualidade: Rápido (15 steps) / Normal (28) / Alta (40)
- [ ] Select de aspect ratio: 1:1 / 16:9 / 9:16

### v3.0 — Geração de Vídeo (médio-longo prazo)
- [ ] Aba "Fase 03" no frontend: Toggle Imagem | Vídeo
- [ ] Novo workflow `tLotD-03` com branching por tipo
  - Imagem: template RunPod com DreamShaper XL
  - Vídeo: `hearmeman/comfyui-wan-template:v11` (Wan2.1, CUDA 12.8, 480p)
- [ ] Setup modelos Wan2.1 no volume `f1yahlb3w9`
- [ ] Pipeline ComfyUI T2V: 480p, ~5s, 16fps
- RTX 4090 suporta Wan2.1 480p com `enable_vae_tiling`

### v3.1 — LoRAs do tLotD (longo prazo)
- [ ] Dataset: concept art e referências visuais do tLotD
- [ ] Pipeline de treinamento: ComfyUI AI Toolkit em pod RunPod dedicado
- [ ] LoRAs por categoria: personagens, cenários, artefatos, UI/HUD
- [ ] Salvar no volume: `/workspace/models/loras/`
- [ ] Agente Decisor (v2.3) escolhe qual LoRA carregar por tipo de asset

### v4.0 — SLMs Especializados na Lore (longo prazo)
- [ ] Fine-tuning de SLM (ex: Phi, Mistral 7B) com lore + histórico de interações validadas
- [ ] Hospedar no RunPod Serverless
- [ ] Substituir chamadas OpenAI dos agentes pelo SLM próprio
- Pré-requisito: dataset de interações dos agentes coletado ao longo da Fase 02

### Infraestrutura Contínua
- [ ] Backup do Network Volume (rclone no VPS do n8n → OneDrive/GDrive/S3)
- [ ] Investigar templates RunPod com ComfyUI pré-instalado (reduzir 8.3GB pull)
- [ ] Autenticação no frontend
- [ ] Fila para múltiplos usuários simultâneos
- [ ] Chat de consulta de lore (widget separado da geração de assets)

---

## Problemas Conhecidos

| Problema | Impacto | Status |
|---|---|---|
| Imagem Docker GHCR 8.3GB — pull 5-8 min por request | ALTO | Mitigado por pod reuse; investigar template RunPod |
| System prompts dos agentes genéricos (sem lore real) | MÉDIO | Aguarda setup Notion |
| Sem autenticação no frontend | BAIXO | Planejado futuro |

---

## Arquivos do Projeto

| Arquivo | Descrição |
|---|---|
| `Dockerfile` | Imagem Docker: CUDA 12.1 + PyTorch + start.sh (8.3GB total) |
| `start.sh` | Inicialização: clona ComfyUI, pip install, inicia servidor porta 8188 |
| `workflows/tLotD-n8n-28-02-2026.json` | Export do workflow n8n Fase 01 (backup) |
| `workflows/comfyui_pipeline.json` | Pipeline ComfyUI em formato API (para teste direto na UI) |
| `frontend/index.html` | Frontend com abas: Fase 01 (v2.2) e Fase 02 (v2.3 IA) |
| `.github/workflows/build.yml` | CI/CD — build e push automático para GHCR |
