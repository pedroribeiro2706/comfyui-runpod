# Lore Validator Architecture (Authoritative Spec)

Este documento define a arquitetura oficial do sistema de validação de lore.
Qualquer implementação deve seguir esta especificação.

Quero atualizar a arquitetura do Lore Validator no n8n. Considere este texto como a especificação oficial para implementação.

OBJETIVO

Implementar um MVP robusto com dois workflows, usando o Notion como fonte única de verdade da lore, Postgres como armazenamento dos artefatos canônicos, e validação por contexto montado dinamicamente.

Não usar Lore.md como fonte principal.
Não implementar RAG nesta fase.
Não implementar Lore Graph nesta fase.
Lore Graph será a próxima evolução, depois deste MVP.

ARQUITETURA CONCEITUAL A PRESERVAR

User Prompt
↓
1. Extract Entities (LLM)
↓
2. Read Canon Artifacts
↓
3. Context Builder (Function/Code)
↓
4. Validator Model
↓
5. Output

Essa arquitetura deve continuar sendo a base do sistema.

DECISÃO DE ARQUITETURA

A fonte única de verdade da lore será o Notion.
O workflow de ingestão deve ler o conteúdo do Notion, incluindo o conteúdo real das páginas via blocks, e compilar artefatos canônicos consumidos pelo workflow validador.

O problema atual é que a validação consulta lore de forma insuficiente e acaba entregando metadados ou contexto raso ao modelo. Isso deve ser corrigido na ingestão, não no momento da validação.

ESCOPO DESTA FASE

Implementar 2 workflows:

1. Workflow de ingestão da lore
2. Workflow de validação de prompt

Não alterar a lógica do frontend além do necessário para manter compatibilidade com o workflow atual.
Manter o comportamento atual do modal/headers/force flag, salvo se algum ajuste mínimo for necessário para integrar a nova arquitetura.

==================================================
WORKFLOW 1 — LORE INGESTION
==================================================

Objetivo:
Buscar a lore no Notion, recuperar o conteúdo real das páginas, compilar artefatos canônicos e salvar no Postgres.

Requisitos:

1. A ingestão deve buscar a lore no Notion API
2. Deve recuperar o conteúdo real das páginas via blocks, não apenas page properties
3. Deve suportar leitura recursiva de blocos aninhados quando necessário
4. Deve compilar os seguintes artefatos canônicos:

- lore_overview.md
- canon_rules.json
- characters.json
- locations.json
- timeline.json
- visual_constraints.json

5. Deve reduzir hardcode ao máximo
6. Principalmente, NÃO hardcodar characters e locations se essas informações puderem ser extraídas do conteúdo do Notion
7. Se houver hardcode temporário, ele deve ficar restrito apenas a regras globais extremamente estáveis e deve ser claramente isolado no código
8. O workflow deve ser idempotente: rodar novamente deve sobrescrever/atualizar os artefatos sem duplicação
9. O workflow deve registrar updated_at

Fonte de ingestão:
Notion

Importante:
O compilador deve derivar os artefatos da fonte do Notion.
Não quero um pseudo-compilador que apenas injeta conteúdo manual no node de código.

Estratégia de compilação esperada:

- ler páginas relevantes da lore no Notion
- recuperar blocks
- normalizar o texto
- remover ruído de formatação que não ajuda a validação
- organizar conteúdo por domínio
- gerar artefatos separados por responsabilidade

Artefatos esperados:

1. lore_overview.md
Descrição textual consolidada do mundo, tom, conflito central, atmosfera, fundamentos narrativos e contexto geral.
Esse artefato é textual e deve servir como fallback narrativo.

2. canon_rules.json
Regras duras do universo.
Exemplos:
- espécies/extinções
- restrições do mundo
- tecnologia permitida
- magia existente/inexistente
- proibições gerais
- regras fundamentais de canon

3. characters.json
Entidades de personagens de forma estruturada.
Idealmente com campos como:
- name
- aliases
- role
- faction
- status
- traits
- appearance
- constraints
- notes

Não precisa ter todos os campos completos se a lore não permitir, mas a estrutura deve ser consistente.

4. locations.json
Entidades de lugares de forma estruturada.
Idealmente com campos como:
- name
- aliases
- type
- atmosphere
- visual_traits
- constraints
- notes

5. timeline.json
Cronologia desde já.
Mesmo que inicialmente simples, deve existir.
Estrutura mínima aceitável:
- eras
- major_events
- order / temporal notes

6. visual_constraints.json
Regras visuais para geração.
Exemplos:
- forbidden elements
- style guidance
- creature rules
- atmosphere rules

==================================================
POSTGRES — SCHEMA
==================================================

Não usar a tabela simples antiga com apenas content JSONB.
Quero um schema melhor que suporte tanto markdown quanto JSON.

Use este schema:

CREATE TABLE IF NOT EXISTS lore_artifacts (
  artifact_name TEXT PRIMARY KEY,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('json', 'markdown')),
  content_json JSONB,
  content_text TEXT,
  source_ref TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (
    (artifact_type = 'json' AND content_json IS NOT NULL AND content_text IS NULL)
    OR
    (artifact_type = 'markdown' AND content_text IS NOT NULL AND content_json IS NULL)
  )
);

Regras:
- lore_overview deve ser salvo como artifact_type = 'markdown' em content_text
- os demais artefatos devem ser salvos como artifact_type = 'json' em content_json
- source_ref pode guardar referência da origem no Notion (page id, database id, ou marcador equivalente), se for útil

Quero UPSERT.
Nada de inserts duplicados.

==================================================
WORKFLOW 2 — PROMPT VALIDATION
==================================================

Objetivo:
Receber o prompt do usuário, extrair entidades, buscar somente os artefatos relevantes no Postgres, montar um contexto focado e enviar ao modelo validador.

A arquitetura deve ser:

User Prompt
↓
Extract Entities (LLM)
↓
Read Canon Artifacts
↓
Context Builder
↓
Validator Model
↓
Output

Requisitos:

1. O workflow deve continuar compatível com a lógica já existente do tLotD-02 sempre que possível
2. Substituir a lógica atual de busca rasa de lore por leitura dos artefatos canônicos no Postgres
3. O modelo não deve receber toda a lore bruta
4. O Context Builder deve montar apenas o contexto necessário

==================================================
EXTRACT ENTITIES
==================================================

Nesta fase, quero usar LLM para entity extraction, não keyword matching puro como mecanismo principal.

Objetivo:
Extrair do prompt referências a:
- characters
- locations
- creatures
- factions
- events
- eras
- visual cues relevantes

Saída estruturada esperada, por exemplo:

{
  "characters": [],
  "locations": [],
  "creatures": [],
  "factions": [],
  "events": [],
  "eras": [],
  "visual_cues": []
}

Requisitos importantes:
- normalizar texto para matching posterior
- considerar aliases quando existirem nos artefatos
- tolerar pequenas variações de escrita
- se nenhuma entidade específica for encontrada, o sistema deve conseguir usar contexto geral

Nesta fase, não quero um sistema super complexo, mas também não quero depender apenas de includes de string fixa.

==================================================
READ CANON ARTIFACTS
==================================================

O workflow deve buscar no Postgres apenas os artefatos necessários.

Carregar sempre:
- canon_rules
- visual_constraints

Carregar condicionalmente, conforme entidades detectadas:
- characters
- locations
- timeline

Carregar lore_overview como fallback narrativo quando:
- não houver entidades específicas suficientes
- o contexto estiver pobre
- o validador precisar de contexto geral do mundo

==================================================
CONTEXT BUILDER
==================================================

O Context Builder deve montar o contexto em ordem explícita e estável.

Ordem obrigatória:

1. canon_rules
2. visual_constraints
3. characters relevantes
4. locations relevantes
5. timeline relevante
6. lore_overview como fallback

Regras do Context Builder:

- não concatenar tudo bruto sem critério
- não despejar JSONs inteiros desnecessariamente
- selecionar apenas os trechos/objetos relevantes
- manter contexto pequeno, legível e previsível
- destacar seções de forma clara
- quando houver entidade específica, priorizar a entidade específica
- usar lore_overview apenas como apoio, não como bloco principal sempre

Objetivo:
reduzir tokens, reduzir ruído e melhorar consistência do julgamento do modelo.

==================================================
VALIDATOR MODEL
==================================================

O modelo validador deve receber:
- prompt do usuário
- contexto montado pelo Context Builder

O modelo deve retornar saída estruturada no formato:

{
  "status": "approved | rejected | needs_review",
  "reason": "texto curto e claro",
  "lore_references": []
}

Requisitos:
- reason deve explicar a decisão de forma objetiva
- lore_references deve apontar quais artefatos/seções sustentaram a decisão
- needs_review deve ser usado quando houver ambiguidade real, não como fallback preguiçoso

==================================================
O QUE NÃO IMPLEMENTAR AGORA
==================================================

Não implementar agora:
- RAG
- embeddings
- vector DB
- Lore Graph
- retrieval vetorial
- regras estruturais baseadas em grafo

Mas a implementação deve deixar espaço para evolução futura.

==================================================
EVOLUÇÃO FUTURA PREVISTA
==================================================

Depois deste MVP, a próxima etapa será:

1. adicionar Lore Graph para validações estruturais
2. melhorar entity extraction
3. melhorar Context Builder
4. só depois avaliar necessidade real de RAG

Importante:
o código e os workflows desta fase não devem bloquear essa evolução.

==================================================
AJUSTES IMPORTANTES NO PLANO ANTERIOR
==================================================

Considere que o plano anterior tinha estes problemas, que agora devem ser corrigidos:

1. Lore.md não deve ser a fonte principal
   A fonte principal agora é o Notion

2. canon_overview deve ser renomeado para lore_overview
   E deve ser tratado como markdown/texto

3. timeline deve existir desde já
   Não deixar para depois

4. reduzir hardcode no compilador
   Especialmente em characters e locations

5. não usar schema simplista que força tudo em JSONB
   Usar schema com artifact_type + content_json/content_text

6. montagem de contexto deve ter ordem explícita
   Não concatenar artefatos de forma arbitrária

7. a fase atual ainda NÃO é Lore Graph
   Não misturar os conceitos

==================================================
ENTREGÁVEIS ESPERADOS
==================================================

Quero que você:

1. proponha a atualização detalhada dos dois workflows com base nessa especificação
2. ajuste o workflow de ingestão para usar Notion como fonte
3. ajuste o workflow de validação para usar os artefatos no Postgres
4. proponha os nodes concretos que serão alterados/criados
5. proponha as queries SQL necessárias
6. proponha os trechos de código dos nodes Code/Function necessários
7. mantenha compatibilidade com o fluxo atual do tLotD-02 sempre que possível
8. identifique qualquer dependência ou risco técnico real antes de editar
9. só depois disso, execute as mudanças no n8n

Antes de implementar, quero que você me devolva um plano de execução objetivo e fiel a esta especificação.