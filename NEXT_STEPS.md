# tLotD — Pipeline de Geração de Assets: Estado Atual e Próximos Passos

## Estado do Pipeline (v2 — Fev 2026)

Pipeline end-to-end funcional. Fluxo completo:

```
Frontend (HTML) → n8n Webhook
  → Criar pod no RunPod (RTX 4090)
  → Aguardar pod RUNNING (polling a cada 10s)
  → Aguardar ComfyUI pronto (polling /system_stats a cada 10s)
  → Enviar prompt ao ComfyUI (POST /prompt)
  → Aguardar geração (polling /history a cada 3s)
  → Baixar imagem (GET /view)
  → Retornar imagem ao frontend
  → Aguardar 60s
  → Deletar pod
```

**n8n workflow ID:** `3wgEcu7GkDL1YhZU`
**Nós:** 18
**Modelo:** SD 1.5 (`v1-5-pruned-emaonly.safetensors`)
**Resolução:** 512×512
**GPU:** RTX 4090 (fallback: RTX 4080, RTX A6000)

---

## O Pipeline ComfyUI: O Que Está Acontecendo "Por Baixo"

Quando o n8n faz `POST /prompt`, ele envia um JSON que descreve um **grafo de nós do ComfyUI**. Cada nó faz uma tarefa específica. O que está sendo enviado atualmente:

### Nós do Pipeline Atual

| ID | Nó (class_type) | Função |
|---|---|---|
| `1` | `CheckpointLoaderSimple` | Carrega o modelo SD 1.5 |
| `2` | `CLIPTextEncode` | Codifica o **prompt positivo** (vem do frontend) |
| `8` | `CLIPTextEncode` | Codifica o **prompt negativo** (fixo) |
| `4` | `EmptyLatentImage` | Cria canvas vazio 512×512 |
| `3` | `KSampler` | **Gera a imagem** (20 steps, CFG 8, euler sampler) |
| `6` | `VAEDecode` | Converte latent space → pixels |
| `7` | `SaveImage` | Salva no disco com prefixo "tLotD" |

### Parâmetros Atuais do KSampler

```json
{
  "steps": 20,
  "cfg": 8,
  "sampler_name": "euler",
  "scheduler": "simple",
  "denoise": 1.0
}
```

### Prompt Negativo Atual (fixo)

```
deformed, ugly, low quality, blurry, watermark
```

---

## Como Inspecionar e Testar o Pipeline Diretamente no ComfyUI

Você pode testar e modificar o pipeline **sem passar pelo n8n**, direto na interface visual do ComfyUI:

### Passo a Passo

1. **Inicie um pod** no RunPod manualmente (ou aguarde o n8n criar um)
2. **Abra a porta 8188** no painel do RunPod (botão "Connect" → porta HTTP 8188)
3. No ComfyUI, clique em **"⚙ (Settings)"** no canto superior direito → ative **"Enable Dev Mode Options"**
4. Agora aparece o botão **"Save (API Format)"** — isso exporta no formato que o n8n usa
5. Para carregar um pipeline: clique no ícone de pasta → **"Load"** → selecione um JSON

### JSON do Pipeline Atual (para carregar no ComfyUI)

Veja o arquivo `workflows/comfyui_pipeline.json` neste repositório. Para usar:
1. Abra o ComfyUI na porta do pod
2. Clique em "Load" → selecione `workflows/comfyui_pipeline.json`
3. O pipeline aparece na tela — você pode modificar e testar
4. Para salvar as alterações: "Save (API Format)" → copie o JSON de volta para o n8n

---

## Por Que a Imagem Diverge do Prompt

**Causa principal:** O modelo **SD 1.5** tem capacidade limitada de interpretação de prompts complexos. Foi lançado em 2022 e é o modelo base mais simples disponível.

O prompt do teste tinha elementos muito específicos e complexos (asas assimétricas, máscara branca, contexto de fantasia escura) — SD 1.5 não consegue renderizar fielmente esse nível de detalhe.

### Melhorias Imediatas (sem trocar o modelo)

| Parâmetro | Atual | Recomendado | Motivo |
|---|---|---|---|
| `steps` | 20 | 28–35 | Mais iterações = mais detalhes |
| `cfg` | 8 | 6–7 | Reduz saturação e artefatos |
| `scheduler` | `simple` | `karras` | Melhor distribuição de passos |
| `sampler_name` | `euler` | `euler_ancestral` | Mais variedade e detalhes |
| Resolução | 512×512 | 512×768 | Personagens ficam mais proporcionais |

### Melhorias de Prompt

Adicionar ao prompt negativo:
```
extra limbs, extra fingers, malformed hands, lowres, bad anatomy,
missing limbs, floating limbs, mutated hands, poorly drawn face
```

Adicionar ao início do prompt positivo:
```
masterpiece, best quality, highly detailed, concept art,
digital painting, [descrição do personagem]
```

### Troca de Modelo (impacto maior)

Para o estilo "fantasia sombria" do tLotD, modelos recomendados:
- **DreamShaper XL** — excelente para fantasia, personagens e conceitos
- **Juggernaut XL** — fotorrealista e detalhado
- **SDXL Base 1.0** — base sólida, mais aderente ao prompt

Trocar o modelo = baixar o `.safetensors` para `/workspace/models/checkpoints/` no volume e atualizar o `ckpt_name` no n8n.

---

## Problemas Conhecidos (a corrigir)

### 1. Nó "Terminate Pod" retorna erro

**Erro:** `Invalid JSON in response body`
**Causa:** O endpoint `DELETE /pods/{id}` retorna corpo vazio (204 No Content), mas o nó tenta parsear como JSON.
**Fix:** Atualizar o nó para aceitar resposta vazia (`neverError: true`, `responseFormat: "text"`).
**Impacto:** Nenhum — o pod já é deletado corretamente. É só ruído no log.

### 2. Pod novo a cada request

Cada request cria um pod novo (~2-3 min de startup). Não há reuso se já existe um pod ativo do request anterior.
**Fix futuro:** Verificar `GET /pods` antes de criar — se há pod `tLotD-comfy` com status RUNNING, reusar.

---

## Roadmap de Próximas Iterações

### v2.1 — Qualidade (curto prazo)
- [ ] Fix "Terminate Pod" (sem impacto funcional, só limpa o log)
- [ ] Melhorar parâmetros do KSampler (steps, CFG, scheduler)
- [ ] Melhorar prompt negativo
- [ ] Criar `workflows/comfyui_pipeline.json` para testes diretos

### v2.2 — Modelo (médio prazo)
- [ ] Avaliar e baixar modelo melhor para o volume (DreamShaper XL ou similar)
- [ ] Atualizar n8n para usar o novo modelo
- [ ] Ajustar resolução para 768×768 ou 1024×1024 se o modelo suportar

### v2.3 — Infraestrutura (médio prazo)
- [ ] Pod reuse: verificar se pod já existe antes de criar
- [ ] Parâmetros dinâmicos no webhook: `{ "prompt": "...", "steps": 30, "cfg": 7 }`
- [ ] Timeout máximo de iterações nos loops de polling

### v3.0 — Produto (longo prazo)
- [ ] Múltiplos modelos/estilos configuráveis
- [ ] Fila de requests (queue) para múltiplos usuários simultâneos
- [ ] Feedback de progresso em tempo real (WebSocket ComfyUI)
- [ ] Persistência das imagens geradas (S3 ou volume)
- [ ] Autenticação no frontend

---

## Arquivos do Projeto

| Arquivo | Descrição |
|---|---|
| `Dockerfile` | Imagem Docker do ComfyUI para RunPod |
| `start.sh` | Script de inicialização do pod (clone ComfyUI, instala, inicia servidor) |
| `workflows/tLotD_v2.json` | Export do workflow n8n (backup/importação) |
| `workflows/comfyui_pipeline.json` | Pipeline ComfyUI em formato API (para teste direto na UI) |
| `frontend/index.html` | Frontend standalone para gerar assets |
| `.github/workflows/build.yml` | CI/CD — build e push automático para GHCR |
