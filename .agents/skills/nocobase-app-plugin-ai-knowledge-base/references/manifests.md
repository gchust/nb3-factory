# Preloading Knowledge Bases with Manifests

A Manifest is a YAML object that declares a knowledge base and the files it should contain. `config.yml` lists where Manifests are; at every startup the plugin reads each one that has not finished, creates or extends the knowledge base, imports the files, and vectorizes them. It is the way to give every environment the same knowledge base without clicking: a fresh database, a new developer checkout, a staging copy.

Use a Manifest when the documents are known ahead of time and belong with the App — product manuals, policies, a help center export. Use AI settings uploads for content that administrators curate at run time.

## Contents

- [How a startup run works](#how-a-startup-run-works)
- [Where the files live](#where-the-files-live)
- [Declare Manifests in `config.yml`](#declare-manifests-in-configyml)
- [The Manifest schema](#the-manifest-schema)
- [Operations](#operations)
- [What a restart does](#what-a-restart-does)
- [Recipes](#recipes)
- [Diagnose a Manifest](#diagnose-a-manifest)
- [Apply a Manifest from server code](#apply-a-manifest-from-server-code)

## How a startup run works

```text
startup
  └─ vector databases from config.yml are synchronized first
  └─ for each ai.aiKnowledgeBase.manifests[] entry, for each location, in order:
       source = (disk, normalized location)
       already SUCCESS?            → skip, forever
       recorded but unfinished?    → re-run the stored snapshot, skipping finished files
       new?                        → read the YAML from Drive, validate, store a snapshot, run it
       run: prepare the target knowledge base (init / append / recover)
            for each unfinished file: read it from its disk → store it as a document
                                      → dispatch vectorization
       any error → a warning in the server log; startup continues
```

Three consequences shape everything below:

- **Manifests run only at startup.** A configuration reload does not run them. Under `pnpm dev`, saving `config.yml` restarts the server, which does. Outside development, restart the App after changing a Manifest list.
- **Startup waits for the import.** Files are read and stored one after another before the App reports ready, so a large preload makes that start slower, and embedding it consumes quota.
- **Failures never stop the App.** A broken Manifest is a warning in the log, not a failed start. Always read the log and the knowledge base after a start that should have imported something.

## Where the files live

A Manifest location and every file location are Drive object keys relative to a named disk: not host paths, and not URLs. A leading `/` is removed, `\` becomes `/`, `.` and `..` segments are normalized, and a key that escapes the disk (`../x`) is rejected. Source disks need not be on the knowledge-base allowlist; only `initiate.disk`, where the imported copies are stored, must be.

**Nothing about a Manifest is packaged or deployed.** `pnpm build` ships neither `config.yml` nor `storage/`, nor any directory of preload sources, and a deployment does not fetch them from anywhere. Every environment that should have the knowledge base — each developer's machine, staging, production — needs three things put in place on that environment, by whoever operates it, before the start that should import:

1. the Manifest YAML objects, on the disk named under `ai.aiKnowledgeBase.manifests`;
2. every file the Manifests list, on the disk each `files` group names, at the same object keys;
3. the `ai.aiKnowledgeBase.manifests` list, and the vector database and storage entries the Manifests reference, in that environment's own `config.yml`.

**Tell the user this before writing a Manifest**, and when you finish, list exactly which objects and which `config.yml` entries each target environment needs. Do not assume the files you placed on your development disk will appear anywhere else, and do not try to make the build carry them.

Where the sources can live:

| Source disk                         | What the operator does on each target environment                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `local` (`storage/` beside the App) | copies the Manifests and files into that environment's `storage/` — beside `dist/` in a deployment — at the same keys                |
| an `s3` disk                        | uploads the objects to the bucket that environment's `drive` configuration points at; environments sharing a bucket share the upload |
| another `fs` disk                   | puts the files at the directory that disk's `location` resolves to on that host                                                      |

In development `storage/` is ignored by git, so files placed there are not committed either. If the team wants the sources under version control, keeping them in the repository is fine, but copying them onto each environment's source disk remains a manual deployment step; record in the App's `AGENTS.md` or README where they come from and where they must be copied, so the next person can reproduce the import.

## Declare Manifests in `config.yml`

```yaml
ai:
  aiKnowledgeBase:
    manifests:
      - disk: local # the disk holding the Manifest YAML objects
        locations: # one or more Manifest object keys, processed in this order
          - preload/product-manuals/init.yml
          - preload/product-manuals/2026-10-append.yml
```

Put an `init` before any `append` or `recover` for the same knowledge base. Document the list in `config.example.yml`, and remind the user that each target environment's `config.yml` needs it written there — `config.yml` is never copied by the build.

## The Manifest schema

One YAML object per location. The schema is strict: an unknown field anywhere rejects the whole Manifest.

```yaml
# preload/product-manuals/init.yml on disk `local`
key: product-manuals # the knowledge base key; stable, unique
operation: init # init | append | recover
initiate: # required for init, ignored otherwise
  disk: kb-files # where the imported copies are stored; must be on the allowlist
  name: Product manuals # display name
  vectorDatabase: primary # an enabled vector database key
  llmService: embeddings # an enabled ai.llmServices name whose provider embeds
  embeddingModel: text-embedding-3-small # a model id proven against that service
  description: Manuals for current products # optional
files: # at least one group
  - disk: local # the disk the source files are read from
    locations: # at least one object key per group
      - preload/product-manuals/manual.pdf
      - preload/product-manuals/faq.md
```

- Every text value is trimmed and must be non-empty.
- The same disk and location may not appear twice in one Manifest.
- Each file follows the upload rules: extension `.pdf`, `.pptx`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.xlsm`, `.txt`, `.md`, `.json` or `.csv`, and at most 100 MiB. The document is named after the last segment of its location.
- `initiate` has no segmentation fields. The knowledge base is created with segmentation on, `chunkSize: 6000`, `chunkOverlap: 1200`, and each imported document keeps those options. To use others, change them on the knowledge base in AI settings for later imports, and regenerate the documents already imported with the new options.
- `init` checks that the vector database and the LLM service exist and are enabled. It checks neither the embedding model nor the disk's contents — prove the model first, see [embedding-services.md](embedding-services.md#prove-the-model-before-using-it).

## Operations

**`init`** creates an enabled LOCAL knowledge base with the Manifest's `key` and the `initiate` settings, marked as owned by this Manifest, and imports the files. If a knowledge base with that key already exists and this Manifest did not create it, the run fails with `Knowledge base key "<key>" is already in use.` rather than touching it. If the knowledge base this Manifest created was deleted afterwards, the run fails with `The knowledge base created by this Manifest no longer exists.` and does not recreate it.

**`append`** imports the files into an existing LOCAL knowledge base, created by a Manifest or by hand. It fails with `Knowledge base #<key> not found` when the key does not exist yet.

**`recover`** replaces the content of files that an earlier, successful Manifest imported into this knowledge base, matched by exact source disk and location — never by filename. For each file: unchanged content is a no-op; changed content keeps the document's ID and key, deletes its old vectors and segments, stores the new bytes, and vectorizes again. A file that no earlier Manifest imported successfully fails with `No successful document mapping exists for recover.`; a file uploaded through AI settings cannot be recovered this way.

A file counts as done once its bytes and document row are stored and vectorization has been dispatched. The Manifest does not wait for the vectors to be written, and a document whose embedding fails is left in `ERROR` while the file and the Manifest still report success.

## What a restart does

A Manifest's identity is its source — the configured disk plus the normalized location — not its content. What happens on the next start depends on how the previous one ended:

| Previous outcome                                                                              | Next start                                                                                            | To change what it does                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Succeeded                                                                                     | Skipped, even if the YAML changed or the knowledge base was deleted                                   | Write a new Manifest at a new location                                                                                                      |
| Failed or interrupted after it was validated (bad reference, missing source file, key in use) | Re-runs the snapshot stored the first time — edits to the YAML are ignored — and skips finished files | Fix what it depends on (create the vector database, upload the missing file) and restart; to change the Manifest itself, use a new location |
| Never validated (YAML object missing, unparsable, or schema error)                            | Read again from the disk                                                                              | Fix the YAML in place and restart                                                                                                           |

So a failed Manifest with a typo in `llmService` warns on every start forever: the stored snapshot keeps the typo. Correct it by writing a corrected copy at a new location, replacing the old location in `config.yml` with it, and restarting. Remove locations from `config.yml` once they have succeeded only if you are sure no environment still needs to run them; a succeeded entry costs one lookup per start.

## Recipes

**First preload.** Prove the embedding model; declare the vector database; put the source files and `init.yml` on the source disk; list `init.yml` under `manifests`; restart; confirm the knowledge base and every document in AI settings reach `SUCCESS`; run a hit test; restart once more and confirm nothing is imported twice. Then give the user the list of objects and `config.yml` entries each target environment needs.

**Add documents later.** Put the new files on the source disk; write a new Manifest at a new location with `operation: append`, the same `key`, and only the new files; append its location to the list; restart.

**Replace documents whose content changed.** Overwrite the source objects at their original locations; write a new Manifest at a new location with `operation: recover`, the same `key`, and those locations; append it to the list; restart. Files whose content did not change are skipped.

**Start over.** Delete the knowledge base in AI settings (with the user's confirmation), then write a new `init` Manifest at a new location. The old one has succeeded and never runs again; an unfinished one that had already created the knowledge base refuses to recreate it.

**Several knowledge bases.** One Manifest per knowledge base, each with its own `key`. Knowledge bases that use the same embedding model can share one vector database record.

**Documents that ended in `ERROR`.** Restarting does not retry them. Fix the cause — the service, the model, the vector database — then re-vectorize those documents from the knowledge base in AI settings, or with `POST /api/aiKnowledgeBases/<key>/vectorizeDocuments` and the body `{ "documentIds": ["<id>", ...] }` (at most 100 ids per request).

## Diagnose a Manifest

There is no Manifest page and no Manifest HTTP API. Read the server log from the start in question; every problem is a warning from module `ai-knowledge-base` naming the source disk and location:

| Log message                                           | Meaning                                                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Knowledge base Manifest source could not be loaded.` | The Manifest object could not be read or failed validation; nothing was stored — fix the YAML or the path in place                           |
| `Knowledge base Manifest processing failed.`          | The target could not be prepared: key in use, knowledge base missing, vector database or LLM service not found or disabled, disk not allowed |
| `Knowledge base Manifest file import failed.`         | One file failed — missing object, unsupported extension, over 100 MiB — while the others continued                                           |

Then open the knowledge base in AI settings and read each document's status and error message. The Manifest's own records live in plugin tables; do not read them as a contract, and never write to them to force a replay — use a new location instead.

## Apply a Manifest from server code

App server code can apply a Manifest without `config.yml`, for example after it has downloaded files to a disk. Resolve the plugin's own token in an App `ServiceProvider` and pass both the parsed Manifest and a source. The source is the identity used for idempotency, exactly as for configured Manifests: give each logical import its own stable `{ disk, location }`, and reuse it only to resume that same import. The service does not read the source object; it reads only the files the Manifest lists.

```ts
import { knowledgeBaseManifestServiceToken } from '@nocobase/app-plugin-ai-knowledge-base/server';

const manifests = this.app.container.resolve(knowledgeBaseManifestServiceToken);
const [record] = await manifests.apply([
  {
    source: { disk: 'local', location: 'imports/handbook-2026-10.yml' },
    manifest: {
      key: 'handbook',
      operation: 'append',
      files: [
        { disk: 'local', locations: ['imports/handbook/leave-policy.md'] },
      ],
    },
  },
]);
// record.status: 'SUCCESS' | 'FAILED'; record.files[i].status, failureReason, documentId
```

`apply()` validates every input before running any, serializes runs of the same source, and resolves with the persisted record after the run; a failed run resolves with `status: 'FAILED'` and `errorMessage` rather than throwing. `state(ids)` returns the current records by ID. Import the token from `@nocobase/app-plugin-ai-knowledge-base/server`; a token recreated with the same name is a different key and resolves nothing.
