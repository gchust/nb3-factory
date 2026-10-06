# Vector Databases

A vector database record tells the plugin where to store and search vectors. The only built-in provider is PGVector — PostgreSQL with the `vector` extension — under the case-sensitive provider key `NocobaseDefaultPGVectorProvider` and spec `PGVector`. LOCAL and READONLY knowledge bases reference a record by its `key`.

## Contents

- [Prepare PostgreSQL](#prepare-postgresql)
- [One table per embedding model](#one-table-per-embedding-model)
- [Declare it in `config.yml` (recommended)](#declare-it-in-configyml-recommended)
- [Or create it over HTTP](#or-create-it-over-http)
- [How configuration is synchronized](#how-configuration-is-synchronized)
- [Verify](#verify)
- [Change and deletion](#change-and-deletion)

## Prepare PostgreSQL

The vector store runs `CREATE EXTENSION IF NOT EXISTS vector` and `CREATE TABLE IF NOT EXISTS <tableName> (id uuid, content text, metadata jsonb, vector vector)` the first time a document of a knowledge base using the record is vectorized. So the PostgreSQL server needs the pgvector package installed, and the connecting role needs either permission to create the extension or a database where an administrator already created it, plus permission to create and write the table.

For local development, the pgvector image is the shortest path; it keeps its data in a named volume. Its user, database and password variable match the [`config.yml` example below](#declare-it-in-configyml-recommended), so the two work together unchanged:

```bash
docker run -d --name nocobase-pgvector -p 5432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=nocobase \
  -e POSTGRES_PASSWORD="$VECTOR_DATABASE_PASSWORD" \
  -v nocobase-pgvector:/var/lib/postgresql/data \
  pgvector/pgvector:pg17
```

Have the user set `VECTOR_DATABASE_PASSWORD` as [secrets.md](secrets.md) describes; when it is in `.env`, run the command inside the subshell described there. If port 5432 is already taken — commonly by a local PostgreSQL — publish another host port, such as `-p 55432:5432`, and use the same number as `connection.port`. Change any other value in both places together: a mismatch passes configuration validation and fails only at vectorization with an authentication error. For an existing server, have its administrator run the following once in the target database, and give the App a role limited to that database or schema:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Managed services need the extension enabled in their own console first on some platforms. The App's main database may be SQLite or anything else; the vector database is an independent connection.

## One table per embedding model

The `vector` column is created without a fixed dimension, so nothing stops two knowledge bases with different embedding models from writing vectors of different lengths into the same table, and a search that meets both fails with a dimension mismatch. Give each embedding model its own vector database record with its own `tableName`. Knowledge bases that share the model can share the record and the table; their rows are separated by knowledge-base metadata.

`tableName` is an identifier with at most one schema prefix: it must match `^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$`, such as `kb_vectors_te3small` or `vectors.kb_te3small`.

## Declare it in `config.yml` (recommended)

A declared record is the same in every environment that loads the configuration, is reviewed with the rest of the App's configuration, and cannot be edited or deleted by accident from the settings page. Add it under `ai.aiKnowledgeBase.vectorDatabases`, keep the password in the environment, and document the entry in `config.example.yml` with the same placeholder:

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

| Field                  | Required | Meaning                                                                                                   |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `key`                  | yes      | Unique, stable identifier; what knowledge bases and Manifests reference, shown as the UID                 |
| `name`                 | no       | Display title; defaults to `key`; need not be unique                                                      |
| `provider`             | no       | Defaults to `NocobaseDefaultPGVectorProvider`, the only built-in                                          |
| `databaseSpec`         | no       | Defaults to `PGVector`                                                                                    |
| `enabled`              | no       | Defaults to `true`; a disabled record is not offered for new knowledge bases and is refused by a Manifest |
| `connection.host`      | yes      | Non-empty                                                                                                 |
| `connection.port`      | yes      | Positive integer                                                                                          |
| `connection.user`      | yes      | Non-empty                                                                                                 |
| `connection.password`  | no       | May be empty                                                                                              |
| `connection.database`  | yes      | Non-empty                                                                                                 |
| `connection.tableName` | yes      | See [One table per embedding model](#one-table-per-embedding-model)                                       |

The connection block is named `connection` here and `connectProps` over HTTP; an entry that writes `connectProps` in `config.yml` is skipped. `${NAME}` placeholders are expanded recursively from `process.env` across the whole entry, so any field can come from the environment; the same `.env` limitation as API keys applies — see SKILL.md § Before you start. `pnpm nocobase config check` does not validate these entries, and it warns that each `${NAME}` here "is not expanded here: the value is used as that literal text"; for `ai.aiKnowledgeBase.vectorDatabases` that warning is wrong, since the plugin expands it at startup.

**An invalid entry is skipped, not fatal.** A missing or duplicate `key`, `connectProps` instead of `connection`, an empty `host`, `user` or `database`, a port that is not a positive integer, an invalid `tableName`, or a `${NAME}` whose variable is unset makes the plugin skip that entry: the App starts, the log says `Invalid vector database configuration was skipped.` with the path and the problem, and a record the entry created earlier keeps its previous values. The other entries are synchronized as usual. Because nothing fails, an invalid entry looks like a change that never takes effect — check each entry against the table above before restarting, check that each referenced variable is set in the environment the server starts from (without printing it), and read the startup log after. Validation checks shape only: it does not connect, so an unreachable server or a wrong password passes and fails later at vectorization.

## Or create it over HTTP

AI settings → Vector databases lists the records and tests their connections; it has no form for adding or editing one. A record stored only in this App's database can be created over HTTP instead. Use it for experiments; declare anything an environment depends on in `config.yml`.

Creation checks whether the table already exists and refuses with `409 ALREADY_EXISTS`, reason `TABLE_ALREADY_EXISTS`, unless `skipTableExistedCheck: true` is sent. Pass that flag only when the user confirms the table is meant to be shared or reattached; attaching an existing table also attaches whatever vectors it holds.

The `POST /api/aiKnowledgeBase/vectorDatabases` body uses `connectProps`, requires `name`, and generates a `key` when it is omitted. It is an alternative to the configuration above, not a second step after it — manage a given key in one place only:

```json
{
  "key": "primary",
  "name": "Primary vectors",
  "provider": "NocobaseDefaultPGVectorProvider",
  "connectProps": {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "example-test-password",
    "database": "nocobase",
    "tableName": "knowledge_base_vectors"
  }
}
```

Over HTTP the password is sent as a literal value, so the request is built from the environment at send time, never written into a file. Responses always return `connectProps: {}`: connections are write-only and cannot be read back. An update merges the supplied top-level `connectProps` fields into the stored ones, so omitting `password` keeps it. See [http-api.md § Vector-database actions](http-api.md#vector-databases).

## How configuration is synchronized

The declared list is reconciled at startup and again on every configuration reload, before any Manifest runs:

- An invalid entry is skipped with a warning, as described above. Its existing record is neither updated nor deleted, and while any entry has no readable `key`, no config-managed record is deleted for being absent — it might be the one that entry meant.

- A new `key` creates a record marked `managedBy: config`; a changed entry updates it. The settings page shows such records read-only, and the HTTP update and delete routes answer `400 FAILED_PRECONDITION` with reason `VECTOR_DATABASE_CONFIG_MANAGED`. Edit `config.yml` instead.
- A key that already belongs to a manually created record is not taken over: the manual record wins and the server logs `Configured vector database conflicts with a manually managed record.` Delete the manual record, or pick another key.
- A key removed from `config.yml` is deleted — unless a knowledge base still references it, in which case it is kept and the log says `Configured vector database was removed from config but is still referenced.` with the blocking knowledge-base keys.
- Any change clears the cached vector stores, so a new password or host is used by the next vectorization or search without a restart.

## Verify

1. Restart, or save `config.yml` under `pnpm dev`, and watch the server log for the warnings above.
2. AI settings → Vector databases lists the key; press Test. For a stored or config-managed record the test runs `SELECT 1` with the connection the server holds, without sending it to the browser. `POST /api/aiKnowledgeBase/vectorDatabases/<id>/testConnection` does the same from a script.
3. A passing test proves connectivity and credentials only. Extension and table permissions are proven by the first document reaching `SUCCESS`; a failure there names the SQL error in the document's `errorMessage`.

## Change and deletion

A knowledge base keeps using the record by key, so changing the host, database or table of an existing record moves every knowledge base on it to a location that does not contain their vectors. Retrieval returns nothing until each document is re-vectorized. Treat such a change like a model change: confirm with the user, then re-vectorize. Changing only the password or port of the same server needs nothing else.

Before deleting a record:

1. List the knowledge bases that reference it — AI settings, or `GET /api/aiKnowledgeBases?vectorDatabaseKey=<key>`.
2. Move or delete those knowledge bases first; deletion is refused with `400 FAILED_PRECONDITION`, reason `VECTOR_DATABASE_IN_USE`, while any reference remains.
3. Back up the vector table if its content may be needed; deleting the record does not drop the table or its rows.
4. Delete it in the settings page, or remove it from `config.yml` if it is managed there.
