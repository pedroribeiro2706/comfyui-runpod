# Plano: Modal de Aprovação — Fase 02

## Objetivo

Quando o prompt é **aprovado** pelo validador de lore, exibir um modal de confirmação antes de prosseguir para a geração de imagem. O usuário decide se gera ou cancela.

---

## Fluxo atual (versão revertida funcional)

```
Lore Valid? → TRUE  → Enhance Prompt → ... → gera imagem (sem confirmação)
            → FALSE → Build Invalid Response → Return Invalid (modal de rejeição)
```

## Fluxo desejado

```
Lore Valid? → TRUE  → Build Valid Response → Return Valid → [execução encerra]
                       frontend abre modal "Prompt aprovado"
                       [Cancelar] → fecha modal, nada acontece
                       [Gerar]    → frontend reenvia com force:true → Enhance Prompt → ... → gera imagem

            → FALSE → Build Invalid Response → Return Invalid → [execução encerra]
                       frontend abre modal "Prompt rejeitado"
                       [Cancelar] → fecha modal
                       [Gerar mesmo assim] → frontend reenvia com force:true → Enhance Prompt → ...
```

---

## Mudanças necessárias

### 1. Workflow n8n (2 novos nodes + 1 reconexão)

**Adicionar node: `Build Valid Response` (Code)**
- Posicionar após `Lore Valid?` na saída TRUE
- Código (espelho do `Build Invalid Response`, com `validated: true`):

```javascript
const data = $input.first().json;
return [{
  json: {
    validated: true,
    status: data.status || 'approved',
    reason: data.reason || '',
    suggestion: data.suggestion || '',
    lore_references: Array.isArray(data.lore_references) ? data.lore_references : []
  }
}];
```

**Adicionar node: `Return Valid` (respondToWebhook)**
- Posicionar após `Build Valid Response`
- Responde HTTP 200 com o JSON acima
- Encerra a execução (sem conexão para frente)

**Reconectar:**
- `Lore Valid?` TRUE → `Build Valid Response` (era direto para `Enhance Prompt`)
- `Build Valid Response` → `Return Valid`

> ⚠️ **IMPORTANTE**: Fazer via `n8n_update_full_workflow` (Agent), NÃO via partial update.
> O partial update API tem bug que cria chaves malformadas em conexões de IF nodes.

---

### 2. Frontend `frontend/index.html` (1 bug fix)

**Bug identificado:** na função `p2send`, o bloco `finally` zera `pendingForcePayload = null` **sempre**, inclusive quando o modal está sendo exibido. Isso faz com que ao clicar "Gerar mesmo assim", `pendingForcePayload` já seja `null` e o `generateForce()` retorne sem fazer nada.

**Localização:** linha 796

```javascript
// ATUAL (bugado):
} finally {
  p2setLoading(false);
  pendingForcePayload = null;  // ← zera ANTES do usuário responder ao modal
}

// CORRETO:
} finally {
  p2setLoading(false);
  // pendingForcePayload é zerado apenas em closeModal() e generateForce()
}
```

O `pendingForcePayload = null` já existe em `closeModal()` (linha 694) — é suficiente.

---

## O que o frontend já faz corretamente (não precisa mudar)

- Detecta `data.validated !== undefined` e abre modal para **qualquer** resultado (aprovado, rejeitado, ambíguo) — linha 740
- Exibe modal verde (`modal-approved`) para `status === 'approved'` — linha 747
- Botão "Gerar" (aprovado) ou "Gerar mesmo assim" (rejeitado) — linha 754
- `generateForce()` reenvia com `force: true` — linha 702
- `Force Flag?` no n8n já roteia `force: true` direto para `Enhance Prompt` — sem mudança

---

## Ordem de execução

1. **Corrigir frontend** — remover `pendingForcePayload = null` do `finally` em `p2send`
2. **Corrigir workflow** — adicionar `Build Valid Response` + `Return Valid`, reconectar `Lore Valid?` TRUE via full update
3. **Testar** sequência completa: prompt válido → modal verde → Gerar → imagem gerada

---

## Riscos e cuidados

- Não tocar nos outros nodes do workflow (ComfyUI, pod management, etc.)
- Usar `n8n_update_full_workflow` via Agent para qualquer mudança de conexão
- Verificar conexões após update com `n8n_get_workflow mode=structure`
