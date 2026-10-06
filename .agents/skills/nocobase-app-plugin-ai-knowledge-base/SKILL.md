---
name: nocobase-app-plugin-ai-knowledge-base
description: Use when a NocoBase 3 App needs the AI Knowledge Base (Professional plugin) — "let the AI employee answer from our documents", "set up RAG / a knowledge base", "configure an embedding model / embedding service", "configure PGVector / a vector database", "which disk stores knowledge base files", "preload documents at startup", "ship a knowledge base with the app", "write a Manifest", "upload documents and run a hit test", "retrieval returns nothing", "documents stay PENDING or ERROR". Not for chat surfaces, employees, tools or chat LLM services (nocobase-app-plugin-ai-employee), ordinary file attachments on business records (nocobase-app-plugin-file), or changing this plugin's source.
metadata:
  short-description: Configure embeddings, PGVector, storage disks and Manifest preloads for AI knowledge bases
---

# AI Knowledge Base in a NocoBase App

This Skill covers what an App configures so that `@nocobase/app-plugin-ai-knowledge-base` can turn documents into vectors and let an AI employee retrieve them: an embedding-capable LLM service, a vector database, a storage disk, the knowledge base itself — preferably preloaded declaratively through a Manifest — and the employee binding. Work inside a CLI-created App (`pnpm create @nocobase/app <name>`); the current directory is the App root when it holds `client/`, `server/`, and `package.json`.

Ignore any globally installed NocoBase 2 Skill that answers to the same words, such as `nocobase-ai-knowledge-base-manager` and its `nb api kb` commands. They describe a different product with different APIs.

## Ownership

```text
App owns       config.yml ai.llmServices / ai.aiKnowledgeBase / drive,
               server/config/drive.ts, Manifest YAML and the files it lists,
               PostgreSQL + pgvector provisioning, credentials, employee binding
Plugin owns    /api/aiKnowledgeBases/*, /api/aiKnowledgeBase/*, parsing,
               segmentation, vectorization jobs, the PGVector provider, Manifest
               processing, AI settings pages, its internal tables
Public entry   config.yml, AI settings → Knowledge bases / Vector databases,
               the HTTP routes, @nocobase/app-plugin-ai-knowledge-base/client,
               knowledgeBaseManifestServiceToken from .../server
Do not bypass  plugin tables (aiKnowledgeBase*, aiVectorDatabases), plugin source
               paths, the synchronized copy under .agents/skills/
```

The AI Employee plugin owns `ai.llmServices`, employees, and the `knowledge-base-retrieve` tool; this plugin only consumes them. Follow the `nocobase-app-plugin-ai-employee` Skill for anything about chat, and for where an API key lives.

## The dependency chain

Every link must exist before the next one works. A missing link rarely fails loudly: documents save and then sit in `ERROR`, or retrieval quietly returns nothing.

| #   | Link              | Where it is configured                                                                                 | Read when                        | Reference                                                                                                               |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Embedding service | `config.yml` → `ai.llmServices[]` with an embedding-capable `provider`                                 | startup and config reload        | [embedding-services.md](references/embedding-services.md)                                                               |
| 2   | Vector database   | `config.yml` → `ai.aiKnowledgeBase.vectorDatabases[]` (or `POST /api/aiKnowledgeBase/vectorDatabases`) | startup and config reload        | [vector-databases.md](references/vector-databases.md)                                                                   |
| 3   | Storage disk      | `drive.disks` + `ai.aiKnowledgeBase.storage.disk` (the allowlist)                                      | startup only                     | [storage-disks.md](references/storage-disks.md)                                                                         |
| 4   | Knowledge base    | a Manifest `init` (preferred), or AI settings / `POST /api/aiKnowledgeBases`                           | Manifest: startup only           | [manifests.md](references/manifests.md)                                                                                 |
| 5   | Documents         | Manifest `files`, or upload in AI settings / `POST /api/aiKnowledgeBase/documents`                     | vectorized after they are stored | [knowledge-bases-and-retrieval.md](references/knowledge-bases-and-retrieval.md)                                         |
| 6   | Employee binding  | AI settings → employee → Knowledge Base tab, or `PATCH /api/aiEmployees/{username}`                    | every chat turn                  | [knowledge-bases-and-retrieval.md](references/knowledge-bases-and-retrieval.md#bind-a-knowledge-base-to-an-ai-employee) |

A knowledge base stores the triple `vectorDatabaseKey` + `llmService` + `embeddingModel`. Those are names, not copies: renaming or removing the service or the vector database later breaks every knowledge base that names it.

## Prerequisites

1. **The plugin is installed and registered on both sides.** Commercial packages come from the NocoBase registry: `npm config set @nocobase:registry=https://npm.nocobase.ai`, with any authentication in the user's own npm configuration, never in a committed file. Then run `pnpm nocobase plugin register @nocobase/app-plugin-ai-knowledge-base` from the App root; it adds the dependency and the entries in `server/plugins.ts` (`/server`) and `client/plugins.ts` (`/client`), and synchronizes this Skill. Those two files are the registration.
2. **`@nocobase/app-plugin-ai-employee` is registered too**, before this plugin in both files. The default template already has it. This plugin resolves its AI manager and settings group; without it the App does not start.
3. **A PostgreSQL server with the `vector` extension is reachable.** It can be the App's own PostgreSQL or a separate one; the App's main database can stay SQLite. See [vector-databases.md § Prepare PostgreSQL](references/vector-databases.md#prepare-postgresql).
4. **The operator has AI settings access.** Every knowledge-base and vector-database action requires a session and the `page:ai.settings` / `access` grant, and answers `403` without it.
5. **The App composes the jobs service.** Vectorization runs as a background job on the application's jobs service, so `server/app.ts` must add `JobExecutorServiceProvider` from `@nocobase/app-server/jobs` and `server/config/index.ts` must include the `jobs` section, as current templates do; without the provider the App refuses to start with an error that names it. The `memory` adapter — also what runs when `jobs.default` is unset — serves one process. Before running more than one instance, set `jobs.default` to a `redis` configuration with a persistent Redis. The `queue` section plays no part in vectorization.
6. **The App mounts the Base UI toaster.** The settings pages report results through the App's Base UI toast, so `client/react-providers.ts` must mount the `toaster` provider from `client/components/ui/toast.tsx`, as current templates do. A page that fails with `Base UI: useToastManager must be used within <Toast.Provider>` is missing it; the `nocobase-app-upgrade` Skill's `references/edge-cases.md`, "Notifications and the Base UI toast", shows how to add it.

## Before you start: what is easy to get wrong

These are verified against the current source. If you are reading this from a newer version of the plugin, check whether each still applies before designing around it.

- **Manifests and their files are not part of the build or the deployment.** `pnpm build` ships neither `config.yml` nor `storage/` nor any preload source. Tell the user, before writing a Manifest, that every environment that should have the knowledge base needs the Manifest YAML and every file it lists placed on its source disk, and the `ai.aiKnowledgeBase` entries written into its own `config.yml` — on that environment, by whoever operates it. See [manifests.md § Where the files live](references/manifests.md#where-the-files-live).
- **A Manifest that was accepted once is never re-read.** Its identity is its disk and location. A succeeded Manifest is skipped on every later start, and a failed one re-runs the copy stored the first time, so editing the YAML at the same location changes nothing. To import something new or correct a Manifest, write it at a new location and list that location. See [manifests.md § What a restart does](references/manifests.md#what-a-restart-does).
- **An invalid vector database entry is skipped, not fatal.** The App starts; the entry is ignored with the warning `Invalid vector database configuration was skipped.`, and a record it had created earlier keeps its old values. So a typo shows up as a vector database that never changes. `pnpm nocobase config check` does not check this section; read the startup log after every change.
- **`${NAME}` placeholders read `process.env`.** They are expanded in `ai.llmServices` and `ai.aiKnowledgeBase.vectorDatabases`, nowhere else in `config.yml`. A value kept in `.env` reaches them only under `pnpm dev`; a built server started with `pnpm start` or a deployment needs a real environment variable. An unset variable is handled differently in the two places: a vector database entry that references one is skipped, while in `ai.llmServices` it expands to an empty string, the service is kept, and embedding fails at vectorization with `apiKey is required`. `pnpm nocobase config check` warns that `${NAME}` is "not expanded here" for `ai.aiKnowledgeBase.vectorDatabases`; that warning is wrong — the plugin does expand it.
- **Every document action returns before the work is done.** Upload, re-vectorize, segment changes and Manifest imports answer with the document `PENDING` and continue in the background; the settings list does not refresh by itself. Reload, or read `GET /api/aiKnowledgeBase/documents/{documentId}`, until the status is `SUCCESS` or `ERROR` — never treat the response of the action as the result.
- **The embedding model is not validated when a knowledge base is created.** A wrong model id is accepted and surfaces only as documents in `ERROR`. Prove the model with a direct provider call first — see [embedding-services.md § Prove the model](references/embedding-services.md#prove-the-model-before-using-it).

## Shortest end-to-end path

Do these in order; each step depends on the one before it. Prefer configuration over clicking: `config.yml` entries and Manifests are repeatable, reviewable, and survive a fresh database, while records created in the UI exist only in one database.

1. **Choose and prove an embedding model.** Reuse the App's chat service when its provider supports embeddings (`openai`, `openai-completions`, `google-genai`, `dashscope`, `mistral`, `ollama`); otherwise add a dedicated service. Settle where the key lives with the user as [secrets.md](references/secrets.md) describes, then prove the chosen model id with one embedding request. See [embedding-services.md](references/embedding-services.md).
2. **Prepare PostgreSQL and declare the vector database** in `config.yml` under `ai.aiKnowledgeBase.vectorDatabases`, with the password as `${NAME}`. Use one `tableName` per embedding model. Restart, read the log for skipped entries, then open AI settings → Vector databases and test the record. See [vector-databases.md](references/vector-databases.md).
3. **Decide the storage disk** for the knowledge base's files, and name it in `ai.aiKnowledgeBase.storage.disk`. Falling through to the App's default disk is a decision, not a neutral default — say which disk that is and ask. See [storage-disks.md](references/storage-disks.md).
4. **Create the knowledge base and its documents.** For content that should exist in every environment, write a Manifest (`operation: init`), list it under `ai.aiKnowledgeBase.manifests`, and tell the user what each target environment must receive by hand; for a one-off, create it in AI settings → Knowledge bases and upload there. See [manifests.md](references/manifests.md) or [knowledge-bases-and-retrieval.md](references/knowledge-bases-and-retrieval.md).
5. **Restart and wait for `SUCCESS`.** A Manifest runs only at startup. Open the knowledge base and confirm every document reaches `SUCCESS`; fix and re-vectorize any `ERROR` rather than uploading again.
6. **Run a hit test** with a sentence copied from a document, and once with an unrelated question to learn this model's score for a miss. If the original sentence does not come back first, the problem is upstream — status, embedding, vector database — not the `Score` threshold.
7. **Bind the knowledge base to the employee**: enable it, select the knowledge bases it should use (an empty selection means every enabled knowledge base), keep `{knowledgeBaseData}` in the prompt, start from `Top K = 3`, and set `Score` above the miss score the hit test showed — the default `0.6` is below it for some models. See [knowledge-bases-and-retrieval.md § Bind](references/knowledge-bases-and-retrieval.md#bind-a-knowledge-base-to-an-ai-employee).
8. **Verify by observation**, not by reading configuration back. Run the checks below.

## Safety

- A key or password never enters the repository or the conversation transcript. Follow [secrets.md](references/secrets.md): the user sets the value; the agent never asks for it, never writes it, refers to it only by variable name, and never prints the environment, `.env`, a shell profile, or a `config.yml` holding a value. The agent may load `.env` into a subshell for a single command under the limits that reference sets. `config.example.yml` carries `${NAME}` placeholders only.
- Vector database connections, including passwords, are stored in plain text in the plugin's table and in every backup of it. Give the vector database a PostgreSQL role scoped to its own database or schema.
- Never invent a provider key, a model id, a vector database key, or a disk name. A wrong provider key drops the service in silence; a wrong model id fails only at vectorization; a disk outside the allowlist is rejected when the knowledge base is created.
- Obtain explicit confirmation before deleting a knowledge base, a document or a vector database, before changing a knowledge base's vector database, service or model (existing vectors are not rebuilt), before re-vectorizing a whole knowledge base, and before pointing a vector database at a table that already exists.
- Knowledge-base content is readable by every employee bound to it and by every user who can chat with that employee. A knowledge base is not an authorization boundary for business data; the data tools and their grants are.
- Never write to the plugin's tables or deep-import plugin internals to finish an App task. If a public surface is genuinely missing, say so and stop.

## Completion checks

- The startup log has no `Invalid vector database configuration was skipped.` warning, and AI settings → Vector databases lists the configured key with a successful connection test.
- The knowledge base shows the intended disk, vector database, LLM service and embedding model.
- Every document is `SUCCESS`, with a non-zero segment count. None is left in `ERROR`.
- A hit test with a sentence copied from a document returns that document first, clearly above the score of an unrelated question, and the employee's `Score` sits between the two.
- In a chat with the bound employee, a question only the documents can answer is answered from them — ask it once with the knowledge base bound and once without, and compare.
- A second restart of the App imports nothing twice: the document count is unchanged and the server log shows no new Manifest warnings.
- When a Manifest is used: the user has been told, in writing, what each target environment needs — the Manifest YAML and its files on the source disk, and the `ai.aiKnowledgeBase` entries in that environment's `config.yml` — because none of it is packaged.
- `config.yml` and `.env` are ignored and untracked; `config.example.yml` documents every new entry with placeholders only.
- No App file imports a plugin private path, and no changed file lives under `.agents/skills/`.

## References

- [secrets.md](references/secrets.md) — where a key or password lives, how the user sets it, and how the agent may use it without seeing it.
- [embedding-services.md](references/embedding-services.md) — which providers embed, the `ai.llmServices` entry, choosing and proving a model, changing it later.
- [vector-databases.md](references/vector-databases.md) — preparing PostgreSQL, `config.yml` versus AI settings, table-per-model, config synchronization, change and deletion.
- [storage-disks.md](references/storage-disks.md) — the disk allowlist, adding a dedicated disk, S3, what is written where, deployments.
- [manifests.md](references/manifests.md) — preloading knowledge bases at startup: layout, schema, `init`/`append`/`recover`, idempotency, recipes, diagnosis.
- [knowledge-bases-and-retrieval.md](references/knowledge-bases-and-retrieval.md) — knowledge-base types and fields, upload and document status, segments, hit tests, binding to an employee, tuning.
- [http-api.md](references/http-api.md) — exact `/api/aiKnowledgeBases` and `/api/aiKnowledgeBase` routes, their errors, for scripts and App code that call them directly. The running App also serves their schemas as OpenAPI at `/api/swagger` and as Swagger UI at `/api/swagger/docs`.
- [client-and-server-api.md](references/client-and-server-api.md) — package exports, the client service and hooks, Registry items, and the server Manifest token.
- [troubleshooting.md](references/troubleshooting.md) — symptom → cause → fix, and the server log messages to look for.
