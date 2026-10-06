# Embedding Services

A knowledge base turns text into vectors by calling an embedding model through an LLM service. There is no separate embedding configuration: the service is an ordinary `ai.llmServices` entry owned by the AI Employee plugin, and the knowledge base stores its `name` as `llmService` plus a model id as `embeddingModel`. The same pair embeds documents at vectorization time and embeds the question at retrieval time, so it must stay the same for the life of the knowledge base.

## Contents

- [Which providers can embed](#which-providers-can-embed)
- [Reuse the chat service or add a dedicated one](#reuse-the-chat-service-or-add-a-dedicated-one)
- [The `ai.llmServices` entry](#the-aillmservices-entry)
- [Choose the model](#choose-the-model)
- [Prove the model before using it](#prove-the-model-before-using-it)
- [Changing the service or model later](#changing-the-service-or-model-later)

## Which providers can embed

Only these built-in provider keys implement embeddings. Every other provider — `anthropic`, `deepseek`, `kimi`, `mimo`, `xai`, `orcarouter`, `shengsuanyun` — fails vectorization with `LLM provider "<key>" does not support embeddings`, and AI settings does not offer a service using one of them for a knowledge base.

| `provider:`          | Embedding endpoint the plugin calls                                                 | Suggested model ids in AI settings                                               | Needs `apiKey` |
| -------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| `openai`             | `{baseURL}/embeddings`, default `https://api.openai.com/v1`                         | `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`     | yes            |
| `openai-completions` | same as `openai`; point `baseURL` at any OpenAI-compatible gateway                  | same as `openai`                                                                 | yes            |
| `google-genai`       | Gemini `embedContent`, default `https://generativelanguage.googleapis.com`          | `gemini-embedding-001`                                                           | yes            |
| `dashscope`          | `{baseURL}/embeddings`, default `https://dashscope.aliyuncs.com/compatible-mode/v1` | `text-embedding-v4`, `-v3`, `-v2`, `-v1`, `text-embedding-async-v2`, `-async-v1` | yes            |
| `mistral`            | `https://api.mistral.ai/v1/embeddings`                                              | `mistral-embed`                                                                  | yes            |
| `ollama`             | `{baseURL}/api/embed`, default `http://localhost:11434`                             | none — enter the id of a model pulled into Ollama, such as `nomic-embed-text`    | no             |

The suggestions are a static list compiled into the provider, not a query against the account. They say nothing about what the account can call, and the field in AI settings accepts any id. `openai-completions` against a gateway works only when that gateway implements `/embeddings`; many chat-only gateways do not.

## Reuse the chat service or add a dedicated one

Reuse the App's existing chat service when its provider is in the table above and its account can call an embedding model: the knowledge base names the same service, and nothing is added. Add a dedicated service when the chat provider cannot embed (an `anthropic` or `deepseek` App), when embeddings should be billed or rate-limited separately, or when they must run somewhere else, such as a local Ollama.

A service used only for embeddings needs no `enabledModels`. `enabledModels` is the chat model list: leaving it out keeps the service out of every chat model selector, which is what an embedding-only service wants, while the knowledge base still reaches it by name. It must be enabled, though — a Manifest refuses a disabled service with `Enabled LLM service "<name>" was not found.`, and AI settings lists enabled services only.

## The `ai.llmServices` entry

`ai.llmServices` belongs to the AI Employee plugin; read the installed `nocobase-app-plugin-ai-employee` Skill for its full contract before writing the entry. Where the key lives follows [secrets.md](secrets.md): agree the place with the user, have them set the value, and never see it yourself. A `${NAME}` whose variable is unset in `ai.llmServices` expands to an empty string — the service is kept, and vectorization fails with `apiKey is required` — so check the variable is set, see [secrets.md § Check a variable without printing it](secrets.md#check-a-variable-without-printing-it).

A dedicated embedding service, as it appears in `config.yml`:

```yaml
ai:
  llmServices:
    - name: embeddings # the value a knowledge base stores as llmService
      title: Embeddings
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
        # baseURL: https://gateway.internal/v1   # optional, same path depth as the default
      enabled: true
      sort: 90
    # A local Ollama needs no key:
    # - name: local-embeddings
    #   provider: ollama
    #   options:
    #     baseURL: http://localhost:11434
    #   enabled: true
```

Record the same entry in `config.example.yml` with the placeholder, never a value. On every load the service's `provider`, `options` and `sort` are rewritten from `config.yml`, so a key rotated in `config.yml` takes effect for embeddings on the next load, and a service removed from `config.yml` disappears — taking every knowledge base that names it down with it.

## Choose the model

Choose once, deliberately, because changing it later means re-vectorizing every document:

- **Use the provider's current general-purpose embedding model** unless the user has a reason not to. Take the id from the provider's own model list or documentation — the same rule as chat models: never from memory. For the OpenAI-shaped providers the list is `GET {baseURL}/models` with the key as a Bearer header, referenced by variable name as in [secrets.md § Use a secret in a command](secrets.md#use-a-secret-in-a-command); Ollama lists pulled models at `GET {baseURL}/api/tags`. A provider's list may omit models it still serves, so prove the chosen id either way.
- **Match the language of the documents.** Most current models are multilingual; older ones, such as `text-embedding-ada-002`, are weaker outside English.
- **Keep one model per vector table.** The PGVector column is created without a fixed dimension, so vectors of different lengths can land in one table, and a search then fails on a dimension mismatch. Give each embedding model its own `tableName` — see [vector-databases.md § One table per embedding model](vector-databases.md#one-table-per-embedding-model).
- **Consider cost and rate limits.** Every segment and every related question is embedded, and every retrieval embeds the question. A large preload makes thousands of calls.

## Prove the model before using it

Nothing validates `embeddingModel` when a knowledge base is created. A wrong id, a model the account cannot call, or a gateway without `/embeddings` is found only when the first document is vectorized, and appears as `indexStatus: ERROR` with the provider's message. Prove the pair first with one request against the provider, referencing the key by variable name only. When the key is in `.env`, run the request inside the subshell [secrets.md § Use a secret in a command](secrets.md#use-a-secret-in-a-command) describes:

```bash
# openai, openai-completions, dashscope (use the service's baseURL when it sets one)
curl -sS "${BASE_URL:-https://api.openai.com/v1}/embeddings" \
  -H "Authorization: Bearer $OPENAI_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"text-embedding-3-small","input":"ping"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.data?.[0]?.embedding?.length ?? r)})'

# ollama
curl -sS http://localhost:11434/api/embed -d '{"model":"nomic-embed-text","input":"ping"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.embeddings?.[0]?.length ?? r)})'
```

A number is the vector's dimension and proves the model; anything else is the provider's error. Never add verbose flags (`-v`, `--trace`) and never echo the variable. `google-genai` takes its key in the query string, so give the user that request to run; when the key lives in `config.yml`, do the same. Once the App is running, the same proof inside NocoBase is one uploaded `.md` document reaching `SUCCESS`.

## Changing the service or model later

A knowledge base's `llmService` and `embeddingModel` can be edited, but its existing vectors are not rebuilt: they stay in the old model's vector space, and questions embedded with the new model match them poorly or fail on a dimension mismatch. The settings page flags the change; the fix is to re-vectorize every document of that knowledge base — AI settings, or `POST /api/aiKnowledgeBases/<key>/vectorizeDocuments` — and, when the dimension changes, to move it to a vector database whose table holds only the new model. Get the user's confirmation first; it re-embeds everything.

Changing only the service's `apiKey` or `baseURL` to the same provider and model needs no re-vectorization.
