# Storage Disks

A LOCAL knowledge base keeps two kinds of file on a NocoBase Drive disk: the uploaded source documents and the segment shards produced from them. The disk is chosen once per knowledge base, from an allowlist the App configures. Uploads never choose a disk — the server always writes to the one on the knowledge base.

Manifest source files are a separate question: they are read from any disk the Manifest names, allowlisted or not. See [manifests.md § Where the files live](manifests.md#where-the-files-live).

## Contents

- [The allowlist](#the-allowlist)
- [What is written where](#what-is-written-where)
- [Use the default disk](#use-the-default-disk)
- [Add a dedicated disk](#add-a-dedicated-disk)
- [Object storage (S3)](#object-storage-s3)
- [Deployments](#deployments)
- [Changing a knowledge base's disk](#changing-a-knowledge-bases-disk)

## The allowlist

The disks a knowledge base may use are resolved once, at startup, from the first of these that is non-empty:

1. `ai.aiKnowledgeBase.storage.disk` — every entry is allowed, in order;
2. `ai.storage.disk` — the default shared by all AI features;
3. `[drive.default]` — the App's default disk, `local` in the default template.

Entries are trimmed and de-duplicated. The first entry is the default when a knowledge base is created without a `disk`. AI settings offers exactly this list (`GET /api/aiKnowledgeBase/storageDisks`), and creating a knowledge base, or a Manifest `init`, with any other disk fails with `400 STORAGE_DISK_NOT_ALLOWED`. Every name must be a disk defined under `drive.disks`; the allowlist does not create one.

This rule differs from AI employee chat attachments, which use only the first entry of `ai.aiEmployee.storage.disk` or `ai.storage.disk`. Do not infer one from the other.

```yaml
ai:
  aiKnowledgeBase:
    storage:
      disk:
        - kb-files # the default for new knowledge bases
        - local # also selectable
```

Editing the allowlist takes effect on the next start; a configuration reload does not change it.

## What is written where

Under the chosen disk, per knowledge base key:

```text
ai-knowledge-base/<knowledgeBaseKey>/documents/<documentKey>        source documents
ai-knowledge-base/<knowledgeBaseKey>/segment-shards/...             segment content, up to 100 segments per shard
```

Each document and shard also records the disk it was written to, so reads and deletes always go back to that disk. Deleting a document or a knowledge base deletes these objects on a best-effort basis. Source documents are available to administrators through `GET /api/aiKnowledgeBase/documents/{documentId}/download`, not through a public URL.

## Use the default disk

With nothing configured, knowledge-base files land on `drive.default`, which in the default template is `local`: the filesystem under `<appRoot>/storage/` during development and `storage/` beside `dist/` in a deployment. That is the same place as the App's general uploads, under the same backup and retention policy, and the directory is ignored by git.

That is acceptable for a trial. Before settling on it, **tell the user which disk the default resolves to and what else is stored there, and ask whether to configure a dedicated disk** — knowledge-base documents are often contracts, manuals, or internal policies.

## Add a dedicated disk

Declare the disk in the App's `server/config/drive.ts` rather than only in `config.yml`, so the location resolves from the App's own paths in development and in a deployment alike. `paths.storage()` resolves against the deployment root, so the directory sits beside `dist/` once deployed:

```ts
// server/config/drive.ts — add to the existing `disks` object
'kb-files': {
  driver: 'fs',
  location: paths.storage('kb-files'),
  visibility: 'private',
},
```

Name the directory after the disk, not `ai-knowledge-base`: the plugin already writes under an `ai-knowledge-base/` prefix on whatever disk it is given, so `paths.storage('ai-knowledge-base')` produces `storage/ai-knowledge-base/ai-knowledge-base/<key>/...`. With `kb-files` the files land in `storage/kb-files/ai-knowledge-base/<key>/...`.

Then allowlist it in `config.yml` as shown in [The allowlist](#the-allowlist), document the entry in `config.example.yml`, and restart. Every `fs` disk location is created at startup if it does not exist. A relative `location` written directly in `config.yml` resolves against the process working directory, which differs between `pnpm dev` and a deployment; prefer `paths.storage(...)`, or an absolute path the deployment provides.

**A directory under `storage/` is a separate disk name, not a separate store.** The default `local` disk's root is `storage/` itself, so everything under `storage/kb-files/` is also reachable through `local` at the key `kb-files/...`, and it shares `storage/`'s backups, retention and access. Tell the user that plainly. When the documents must really be kept apart — other backups, other permissions, another volume — give the disk a location outside `storage/`: an absolute path the deployment provides on its own volume, or a separate S3 bucket.

## Object storage (S3)

An `s3` disk suits deployments with more than one instance or with ephemeral local storage, since every instance must read the same files. The default template already declares an `s3` disk, which is dropped at startup while its `bucket` is empty; give it a bucket, or declare another `s3` disk with `bucket`, `region`, optional `endpoint`, `forcePathStyle`, `supportsACL`, `visibility: private` and `credentials`.

`${NAME}` is not expanded under `drive`, so S3 credentials are either written into `config.yml` — only after confirming with git that it is ignored and untracked, and with the user accepting that the agent then sees them — or supplied through the platform's default credential chain where the deployment offers one. Never put them in `server/config/drive.ts` or `config.example.yml`.

## Deployments

- `pnpm build` ships neither `config.yml` nor `storage/`. The deployment's own `config.yml` needs the same `ai.aiKnowledgeBase.storage` entries and any `drive` overrides.
- An `fs` disk is per host. With more than one instance, or a host whose disk is replaced on redeploy, use object storage, or a shared volume mounted at the same path on every instance.
- Back the disk up together with the database: a document row whose object is gone cannot be re-vectorized and has to be deleted and uploaded again.

## Changing a knowledge base's disk

A knowledge base's `disk` can be updated to another allowlisted disk. Existing documents keep reading from the disk they were written to; only new uploads use the new one. Nothing moves files between disks, so removing the old disk from `drive.disks` breaks every document still stored there. To move a knowledge base, keep both disks until its documents have been deleted and uploaded again — or, simpler, create a new knowledge base on the new disk.
