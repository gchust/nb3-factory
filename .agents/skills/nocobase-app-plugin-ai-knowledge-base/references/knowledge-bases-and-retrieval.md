# Knowledge Bases, Documents and Retrieval

This reference covers creating a knowledge base without a Manifest, what happens to a document after upload, checking retrieval, and binding a knowledge base to an AI employee. The settings pages live under AI settings → **Knowledge bases** (`/settings/ai/knowledge-base`) and **Vector databases** (`/settings/ai/vector-database`); every action below is also available over HTTP, see [http-api.md](http-api.md).

## Contents

- [Knowledge-base types](#knowledge-base-types)
- [Create a LOCAL knowledge base](#create-a-local-knowledge-base)
- [Upload documents](#upload-documents)
- [Document status and retries](#document-status-and-retries)
- [Segments](#segments)
- [Hit test](#hit-test)
- [Bind a knowledge base to an AI employee](#bind-a-knowledge-base-to-an-ai-employee)
- [Tune retrieval](#tune-retrieval)
- [Delete](#delete)

## Knowledge-base types

The type is chosen at creation and cannot be changed afterwards (`400 KNOWLEDGE_BASE_TYPE_IMMUTABLE`); create another knowledge base instead.

| Type       | What it does                                                                                         | Needs                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `LOCAL`    | Stores the files, segments them, and writes and searches vectors. The normal choice.                 | disk, vector database, LLM service, embedding model                                        |
| `READONLY` | Searches vectors that already exist in a vector database table; accepts no uploads or segment edits. | vector database, LLM service, embedding model — the same model that produced those vectors |
| `EXTERNAL` | Delegates retrieval to an external vector-store provider another plugin registers. None is built in. | a provider listed by `GET /api/aiKnowledgeBase/vectorStoreProviders`                       |

Uploads, re-vectorization and every segment change are LOCAL-only and answer `400 LOCAL_KNOWLEDGE_BASE_REQUIRED` otherwise.

## Create a LOCAL knowledge base

In AI settings → Knowledge bases → Add new:

| Field           | Notes                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Name            | Display name                                                                                                 |
| Key             | Stable identifier; what employees and Manifests reference. Generated when omitted — set it yourself          |
| Type            | `LOCAL`                                                                                                      |
| Disk            | One of the allowlisted disks — see [storage-disks.md](storage-disks.md)                                      |
| Vector database | An enabled record — see [vector-databases.md](vector-databases.md)                                           |
| LLM service     | Only enabled services whose provider embeds are offered — see [embedding-services.md](embedding-services.md) |
| Embedding model | Free text with suggestions; must be an id the service's account can call                                     |
| Segmentation    | On by default; `chunkSize` 6000 (1–100000) and `chunkOverlap` 1200 (0 to `chunkSize − 1`), in characters     |

The same over HTTP:

```bash
curl -sS -X POST "$APP_BASE_URL/api/aiKnowledgeBases" \
  -H "x-api-key: $NOCOBASE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"key":"product-manuals","name":"Product manuals","knowledgeBaseType":"LOCAL",
       "disk":"kb-files","vectorDatabaseKey":"primary","llmService":"embeddings",
       "embeddingModel":"text-embedding-3-small",
       "segmentOptions":{"enabled":true,"chunkSize":6000,"chunkOverlap":1200}}'
```

`$APP_BASE_URL` is the URL the App prints as Local on start, without a trailing slash. `$NOCOBASE_API_KEY` is an API key of a user with AI settings access, created on the App's API keys settings page and stored like any other secret — see [http-api.md § Common contract](http-api.md#common-contract). The server checks that the three vector fields are present, that the vector database exists and that the disk is allowlisted; it does not check that the vector database, service or model actually work. A record created here exists only in this database — declare it in a Manifest when other environments need it.

## Upload documents

Open the knowledge base → Upload, one file at a time. Accepted extensions are `.pdf`, `.pptx`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.xlsm`, `.txt`, `.md`, `.json` and `.csv`, up to 100 MiB. The extension decides; the MIME type is only recorded. The upload never names a disk: the file goes to the knowledge base's disk.

```bash
curl -sS -X POST "$APP_BASE_URL/api/aiKnowledgeBase/documents" \
  -H "x-api-key: $NOCOBASE_API_KEY" -F 'knowledgeBaseKey=product-manuals' -F 'file=@./manual.pdf'
```

The response is the stored document, normally `PENDING`: it comes back as soon as the vectorization job is queued, before parsing starts. Read its status again — the settings list does not refresh by itself — before relying on it.

## Document status and retries

| `indexStatus` | Meaning                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `PENDING`     | Stored, vectorization job queued, not started                                |
| `PROCESSING`  | A job is parsing, segmenting, embedding, or writing it                       |
| `SUCCESS`     | Searchable                                                                   |
| `ERROR`       | Failed; `errorMessage` (and `segmentErrorMessage` for segmentation) says why |

Only the latest request of a document writes: re-vectorizing or editing segments while a job runs makes that job stop at its next checkpoint, and a new job redoes the work, so repeating a request never duplicates segments or vectors. A document left `PENDING` or `PROCESSING` by a restart is queued again when the App starts; `ERROR` is never retried automatically. When segments were stored and only embedding failed, `segmentStatus` stays `SUCCESS` and re-vectorizing only re-embeds them.

For `ERROR`, fix the cause first — the provider message usually names a wrong model, a missing key, an unsupported gateway, or an SQL error from the vector database — then re-vectorize the document from its row in the knowledge base, or `POST /api/aiKnowledgeBases/<key>/vectorizeDocuments` with `{"documentIds":["<id>"]}`. Do not upload the same file again: that creates a duplicate document. Re-vectorizing without `documentIds` re-embeds every document of the knowledge base; ask first.

## Segments

Each document's segments can be listed, edited, enabled or disabled, deleted, and given related questions, from the document's segment drawer. Every change re-embeds that document's vectors. An edit carries the segment's current `contentHash`; a stale hash answers `409 ABORTED`, reason `SEGMENT_CONTENT_CHANGED`, so that two editors do not overwrite each other — reload and retry.

Segmentation options are copied from the knowledge base onto each document when it is stored, so changing them on the knowledge base affects later uploads only. To re-segment an existing document, regenerate it with the new options — the regenerate action takes `segmentOptions` and saves them on the document. Regenerating discards that document's manual segment edits and related questions.

## Hit test

Open the knowledge base → Retrieval (hit test), or:

```bash
curl -sS -X POST "$APP_BASE_URL/api/aiKnowledgeBases/product-manuals/search" \
  -H "x-api-key: $NOCOBASE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"query":"How do I reset the device?","topK":3,"score":0.6}'
```

Each result has `content`, `score` (cosine similarity, 0–1, higher is closer), `title`, `filename` and `metadata`. What a score means depends on the embedding model: some models give an unrelated passage 0.3, others 0.65 or more, so a fixed threshold proves nothing on its own. Send `"score": 0` while testing, so nothing is filtered, and test in this order:

1. A question unrelated to every document, such as one about the weather. Its best score is this model's baseline for a miss.
2. A sentence copied verbatim from a document. Its document must come back first, clearly above the baseline.
3. A paraphrase of it.
4. A real user question.

If step 2 fails, the problem is upstream of the threshold: the document is not `SUCCESS`, the knowledge base is disabled, or the embedding service, model or vector database is not what the vectors were written with. Lowering `score` hides that; fix the cause instead.

## Bind a knowledge base to an AI employee

A knowledge base does nothing until an employee uses it. App-defined employees start with the knowledge base switched off, and the binding is kept in the database, so it is set in AI settings → AI employees → the employee → Edit → **Knowledge Base** tab:

| Setting               | What to set                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enable                | On                                                                                                                                                                                                                                                                                                                                                                              |
| Knowledge Base        | The knowledge bases the employee retrieves from. Leave it empty to retrieve from every enabled knowledge base; select some to limit retrieval to those                                                                                                                                                                                                                          |
| Retrieval strategy    | `Retrieve on demand` (default, `retrievalStrategy: "onDemand"`): the employee calls the built-in `knowledge-base-retrieve` tool when it judges the question needs it. `Automatically retrieve for every question` (`retrievalStrategy: "always"`): retrieval runs before every turn and the result is injected — for employees whose every answer depends on internal documents |
| Knowledge Base Prompt | How results are injected. Keep the `{knowledgeBaseData}` placeholder exactly; add instructions around it, such as citing the document name                                                                                                                                                                                                                                      |
| Top K                 | 1–100, default 3                                                                                                                                                                                                                                                                                                                                                                |
| Score                 | 0–1, default 0.6; set it between the miss baseline and the scores of real matches from the [hit test](#hit-test)                                                                                                                                                                                                                                                                |

To set it from a script, send the whole block with `PATCH /api/aiEmployees/<username>`:

```json
{
  "enableKnowledgeBase": true,
  "knowledgeBasePrompt": "From knowledge base:\n{knowledgeBaseData}\nanswer user's question using this information.",
  "knowledgeBase": {
    "knowledgeBaseKeys": ["product-manuals"],
    "retrievalStrategy": "onDemand",
    "topK": 3,
    "score": 0.6
  }
}
```

The employee then answers from the documents only when the knowledge-base feature is active, which requires this plugin to be registered and started; with it missing, the setting is kept and silently ignored. The settings page also mentions role-based restriction of knowledge bases; this plugin version applies none, so every user who can chat with the employee retrieves from all of its knowledge bases.

## Tune retrieval

Start from `Top K = 3` and a `Score` just above the miss baseline the [hit test](#hit-test) measured — the default `0.6` is below that baseline for some models, and then lets unrelated passages through — then adjust against real questions:

- Relevant passages missing, scores just below the threshold → lower `Score` in steps of 0.05, or raise `Top K`.
- Irrelevant passages returned → raise `Score`.
- Answers cut off mid-thought, or passages too broad → regenerate the documents with a different `chunkSize`/`chunkOverlap`, and set the same values on the knowledge base for later uploads; smaller chunks give more precise matches, larger ones more context per match.
- Every extra passage costs prompt tokens on every retrieval.

## Delete

Deleting a document removes its vectors, segments, shards and stored file. Deleting a knowledge base does the same for all its documents, then removes it; vector cleanup is best-effort, and a failure is logged and does not block the deletion. Neither can be undone. A Manifest that created a deleted knowledge base does not recreate it. Confirm with the user, and mind the employees that reference the key: they keep the key and simply stop finding anything.
