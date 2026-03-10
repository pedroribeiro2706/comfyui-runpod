# tLotD — Plano de Arquitetura

**Última revisão:** 2026-03-10

---

## Estado atual — implementado e estável (NÃO modificar)

### Workflows n8n

| Workflow | ID | Nós | Status | Função |
|---|---|---|---|---|
| `tLotD` | `3wgEcu7GkDL1YhZU` | 23 | ATIVO | Pipeline base (Fase 01) |
| `tLotD-02` | `G5ekS4TSs1HaT3Ed` | 35 | ATIVO | Validador de lore + geração (Fase 02) |
| `tLotD-Lore` | `p0P08ym4kFt7nyJi` | 10 | ESTÁVEL | Ingestão Notion → Postgres |
| `tLotD-DB-Migration` | — | — | Executado | Criação do schema Postgres |

### Serviços em produção

| Serviço | URL | Status |
|---|---|---|
| n8n editor | `workflows-mvp.clockdesign.com.br` | ✅ |
| n8n webhook | `webhooks-mvp.clockdesign.com.br` | ✅ |
| notion-fetcher | `notion-fetcher:3000` (interno) | ✅ |
| Lore Editor | `lore-editor.clockdesign.com.br` | ✅ |

### Schema Postgres — tabela `lore_artifacts`

6 artefatos canônicos: `lore_overview` (md), `canon_rules`, `characters`, `locations`, `timeline`, `visual_constraints` (json).

---

## Separação de responsabilidades: artefatos vs. lore graph

| Camada | O que é | Onde vive | Quem escreve | Quem lê |
|---|---|---|---|---|
| **Artefatos canônicos** | Lore compilado em 6 blocos | `lore_artifacts` (Postgres) | tLotD-Lore + Lore Editor | tLotD-02 (validador) |
| **Lore Graph** | Entidades tipadas, relações, timeline granular | A definir | A definir | A definir |

Os artefatos canônicos são a **fonte de verdade atual** para o validador. O Lore Graph é a próxima camada — mais estruturada, consultável, com relacionamentos explícitos.

---

## Roadmap

### ✅ v2.5 — Lore Editor (concluído)
- Implementação Next.js + pg + Monaco Editor
- Deploy no Swarm com Traefik + TLS
- URL pública: `lore-editor.clockdesign.com.br`

### 🔧 v2.6 — Testes end-to-end do validador (próximo)
- [ ] Testar 3 cenários com tLotD-02:
  - Prompt inválido → modal vermelho (rejected)
  - Prompt válido → imagem gerada
  - Prompt ambíguo → modal amarelo (needs_review) → "Gerar mesmo assim"
- [ ] Ajustar system prompts se necessário após testes reais

### 🔲 v3.0 — Lore Graph (próximo planejamento)

Ver seção abaixo.

### 🔲 v3.1 — Geração de Vídeo
- Wan2.1 via RunPod (480p, RTX 4090)
- Aba "Fase 03" no frontend
- Workflow `tLotD-03`

### 🔲 v3.2 — LoRAs do tLotD
- Dataset de concept art do tLotD
- Treinamento no RunPod
- LoRAs por categoria: personagens, cenários, artefatos

### 🔲 v4.0 — SLMs especializados
- Fine-tuning de SLM (Phi, Mistral 7B) com lore + histórico validado
- Substituir chamadas OpenAI dos agentes

---

## v3.0 — Lore Graph: proposta inicial

### Objetivo

O Lore Graph é a segunda camada de representação do lore — complementa os artefatos canônicos com um modelo de dados **normalizado, consultável e relacional**.

Enquanto os artefatos são blocos de texto/JSON para envio ao LLM, o Lore Graph é um banco de entidades e relacionamentos que permite:
- Consultas precisas ("quais personagens pertencem à facção X?")
- Rastreabilidade de relacionamentos (personagem ↔ local ↔ evento)
- Timeline granular com eventos ordenados
- Base para um futuro chat de consulta de lore

### O que o Lore Graph não é

Não substitui os artefatos canônicos. O validador (tLotD-02) continuará usando `lore_artifacts` — o formato em bloco é mais eficiente para envio ao LLM. O Lore Graph é uma camada **adicional**.

### Entidades propostas

| Entidade | Campos principais |
|---|---|
| `Character` | nome, aliases, faction, role, status, appearance, traits, first_appearance |
| `Location` | nome, aliases, type, atmosphere, visual_traits, connected_to |
| `Faction` | nome, alignment, members[], territory |
| `Era` | nome, start, end, key_events[] |
| `Event` | nome, era, participants[], location, description |
| `Artifact` (objeto) | nome, type, owner, power, visual_description |

### Relacionamentos

- `Character` → pertence a → `Faction`
- `Character` → aparece em → `Location`
- `Character` → participa de → `Event`
- `Event` → ocorre em → `Era`
- `Event` → ocorre em → `Location`

### Tecnologia: Postgres relacional vs. Neo4j

| Opção | Prós | Contras |
|---|---|---|
| **Postgres relacional** | Já existe na infra, sem novo serviço, SQL familiar | JOINs complexos para grafos profundos |
| **Neo4j** | Nativo para grafos, Cypher é expressivo para relações | Novo serviço, nova tecnologia, custo de infra |

**Recomendação:** começar com **Postgres relacional**. O grafo do tLotD não é profundo o suficiente para justificar Neo4j agora. Se as queries relacionais ficarem complexas demais, migrar depois.

### Como popular o Lore Graph

Duas opções (a decidir):

1. **Estender o tLotD-Lore:** após compilar os artefatos canônicos, um segundo agente GPT extrai entidades estruturadas e faz UPSERT nas tabelas do Lore Graph
2. **Lore Editor:** adicionar uma aba de gerenciamento de entidades na UI existente

**Recomendação:** opção 1 (automação). Menos trabalho manual, mais escalável.

### Integração com o validador

Quando o Lore Graph estiver populado, o tLotD-02 poderá ser estendido para:
- Verificar se entidades mencionadas no prompt existem no grafo
- Validar relacionamentos (ex: "personagem X não pode estar no local Y nessa era")
- Retornar `lore_references` com links para entidades reais, não só texto

### Schema Postgres proposto (rascunho)

```sql
CREATE TABLE lore_characters (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  aliases     TEXT[],
  faction_id  INTEGER REFERENCES lore_factions(id),
  role        TEXT,
  status      TEXT,
  appearance  JSONB,
  traits      TEXT[],
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lore_locations (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  aliases      TEXT[],
  type         TEXT,
  atmosphere   TEXT,
  visual_traits JSONB,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lore_factions (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  alignment TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lore_events (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  era          TEXT,
  location_id  INTEGER REFERENCES lore_locations(id),
  description  TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Tabelas de relacionamento
CREATE TABLE lore_character_events (
  character_id INTEGER REFERENCES lore_characters(id),
  event_id     INTEGER REFERENCES lore_events(id),
  role         TEXT,
  PRIMARY KEY (character_id, event_id)
);
```

---

## Problemas conhecidos

| Problema | Impacto | Status |
|---|---|---|
| Imagem GHCR 8.3GB — pull 5-8 min | ALTO | Mitigado por pod reuse |
| tLotD-02 não testado end-to-end | MÉDIO | Pendente — v2.6 |
| Frontend sem autenticação | BAIXO | Futuro |
