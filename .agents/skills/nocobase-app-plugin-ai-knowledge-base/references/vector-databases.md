# Vector Databases

## Contents

- [Built-in provider](#built-in-provider)
- [Mutation and validation](#mutation-and-validation)
- [Configuration ownership](#configuration-ownership)
- [Vector-store configuration](#vector-store-configuration)
- [Change and deletion safety](#change-and-deletion-safety)

## Built-in provider

Provider name is case-sensitive: `NocobaseDefaultPGVectorProvider`. Spec/default database spec is `PGVector`.

```ts
type PgConnectProps = {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  tableName: string;
};
```

Host/user/database/table must be non-empty; port is coerced to a positive integer; password is optional. Table allows one optional schema prefix and must match `^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$`.

The provider uses a `pg.Pool` cached by SHA-256 of the database connection props (excluding `tableName`, so tables on the same database share a pool). Connection test executes `SELECT 1`. Creation checks `SELECT 1 FROM <table> LIMIT 1`; undefined table/schema SQLSTATEs mean safe to create, existing table returns status 1. `skipTableExistedCheck:true` bypasses the check and can attach to/overwrite assumptions about existing data; require explicit confirmation.

The LangChain store uses columns `id`, `vector`, `content`, `metadata`, cosine distance, and similarity normalization.

## Mutation and validation

`VectorDatabaseMutation` requires name, provider, and connect props at the public client boundary; key/databaseSpec/enabled/skip are optional. Create defaults key (32-char nanoid), database spec PGVector, provider built-in, enabled true, and stores a SHA-256 JSON hash of connection props.

List, get, enabled-list, create, and update responses return `connectProps: {}` and omit `connectPropsHash` for both manual and config-managed records. Connection properties are write-only; do not depend on reading them back to populate an editor.

Update preserves the existing provider when omitted and merges supplied top-level connection properties into the stored connection before validation and hashing. Omitted properties (including passwords) are preserved; an empty connection object is a no-op, not a request to clear credentials. Explicit values replace the corresponding stored properties, subject to provider validation; the built-in PGVector provider accepts an empty password string but not `null`. Nested property values are replaced, not recursively merged. Update does not test connectivity or table existence. Use `testVectorDatabaseConnection` only when supplying a complete connection; use `testStoredVectorDatabaseConnection(id)` to test the stored connection without retrieving credentials, and perform a retrieval smoke test after an update.

Provider listing currently returns only name/spec, so the public `fields` property is supported by the client mapper but not populated by this server route. Do not invent provider UI fields beyond the built-in contract.

## Configuration ownership

`ai.aiKnowledgeBase.vectorDatabases` is reconciled after the built-in provider is registered. Each entry requires a non-empty, unique `key` as its stable database identifier. `name` is an optional display name and defaults to `key`; different keys may share the same display name. Connection properties must be nested under `connection`, not `connectProps`. The built-in connection fields are `host`, `port`, `user`, optional `password`, `database`, and `tableName`; `${ENV_NAME}` references are expanded recursively. `provider`, `databaseSpec`, and `enabled` default to `NocobaseDefaultPGVectorProvider`, `PGVector`, and `true`.

### Application configuration example

In the application's `config.yml` (set `VECTOR_DATABASE_PASSWORD` in the application environment before loading):

```yaml
ai:
  aiKnowledgeBase:
    vectorDatabases:
      - key: primary
        name: Primary vectors
        connection:
          host: localhost
          port: 5432
          user: postgres
          password: ${VECTOR_DATABASE_PASSWORD}
          database: nocobase
          tableName: knowledge_base_vectors
```

Omitting `name` displays `primary`. Omitting `key`, repeating a key, or using `connectProps` instead of the required `connection` object fails configuration validation. Passing validation does not provision PostgreSQL or pgvector; prepare the database and verify connectivity before vectorization or retrieval.

### HTTP and client mutation example

The equivalent connection properties in a `POST /v2/api/aiVectorDatabases:create` JSON request use `connectProps`. This is an alternative manual-management example, not a second step after configuring the same key:

```json
{
  "key": "primary",
  "name": "Primary vectors",
  "provider": "NocobaseDefaultPGVectorProvider",
  "connectProps": {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "replace-with-database-password",
    "database": "nocobase",
    "tableName": "knowledge_base_vectors"
  }
}
```

Supply this same object to `knowledgeBaseService.createVectorDatabase` from the client. Unlike configuration, manual creation requires `name` and can generate `key` when omitted. Configuration `connection` maps to HTTP/client `connectProps`; `key` remains the stable identifier in both. Environment-reference expansion described above applies to configuration, not HTTP request bodies. Supply credentials securely and never commit real passwords. See [application mutation contracts](application-contracts.md#request-and-mutation-types) and [HTTP vector-database actions](http-api.md#vector-database-actions).

Rows created by this reconciler have `managedBy: "config"`. Public update and destroy return HTTP 409 with code `VECTOR_DATABASE_CONFIG_MANAGED`, and the settings page excludes these rows from edit, selection, and deletion. A same-key manual row is preserved with a warning; a matching display name alone is not a conflict. Config-owned rows removed from configuration are deleted only when no knowledge base references them; referenced rows remain read-only and produce a warning containing the blocking knowledge-base keys.

## Vector-store configuration

LOCAL/READONLY knowledge bases store `vectorDatabaseKey`, `llmService`, and `embeddingModel` directly on `aiKnowledgeBase`. A stable SHA-256 `vectorStoreConfigHash` covers exactly those three normalized values; incomplete configuration yields `null`. Built-in providers receive `knowledgeBaseKey`, reload the inline configuration, and share the underlying vector store by hash.

Vector rebuild proceeds only for LOCAL bases. It creates embeddings through AI Manager, initializes PGVector, deletes vectors filtered by document ID, and adds enabled paragraph/question documents in batches of 10. Missing knowledge bases, incomplete inline configuration, or missing vector databases fail explicitly.

Changing database/model/service does not automatically rebuild. `vectorStoreUpdatedAt` changes only when the normalized three-field configuration changes. The change-status endpoint also compares the related vector database's `updatedAt` against the last confirmation timestamp. Applications should show explicit impact confirmation and schedule selected re-vectorization.

READONLY search can read an existing store without writing; ensure its metadata/content contract matches expected result mapping. EXTERNAL provider execution is outside this package's public extension boundary.

## Change and deletion safety

Connection props and their hash are stored in plugin data; hash is not encryption. Keep API access administrative and credentials secret.

Before deleting a vector database:

1. inspect all bases whose inline `vectorDatabaseKey` points to the database;
2. back up vector data/connection config;
3. disable or migrate dependent bases;
4. confirm retrieval against the replacement;
5. delete with explicit approval;
6. verify no queued job still targets it.

The relation lookup and destroy guard both query knowledge bases directly by inline `vectorDatabaseKey`. Keep deletion approval and queued-job checks because an application-level relation check is not a database foreign-key constraint.
