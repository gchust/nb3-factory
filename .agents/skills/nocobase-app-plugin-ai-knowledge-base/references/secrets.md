# Keys and Passwords

A knowledge base needs up to three secrets: the embedding provider's API key, the vector database password, and — for scripts that call the HTTP API — a NocoBase API key. The rule for all of them is the same: the value never enters the repository, a commit, or the conversation transcript. The user types it; the agent refers to it only by variable name.

This is the minimum procedure. When the installed `nocobase-app-plugin-ai-employee` Skill describes a more detailed one for LLM keys, follow that for `ai.llmServices`; the rules below still apply to everything else.

## Contents

- [Where a secret can live](#where-a-secret-can-live)
- [Check the files are ignored](#check-the-files-are-ignored)
- [Let the user set the value](#let-the-user-set-the-value)
- [Check a variable without printing it](#check-a-variable-without-printing-it)
- [Use a secret in a command](#use-a-secret-in-a-command)

## Where a secret can live

Offer these in order and let the user choose:

| Option          | Where the value is            | `config.yml` holds  | Works in                                                                    |
| --------------- | ----------------------------- | ------------------- | --------------------------------------------------------------------------- |
| 1 — recommended | a system environment variable | `${OPENAI_API_KEY}` | `pnpm dev`, `pnpm start`, and a deployment, the same way                    |
| 2               | the App's `.env`              | `${OPENAI_API_KEY}` | **`pnpm dev` only**; a built server does not read `.env` into `process.env` |
| 3               | `config.yml` itself           | the value           | everywhere, but the agent sees the value every time it edits the file       |

`${NAME}` is expanded only in `ai.llmServices` and `ai.aiKnowledgeBase.vectorDatabases`. A deployment has its own environment and its own `config.yml`: the variable has to be set where its service manager starts the process, not only in the user's terminal. `config.example.yml` always carries the placeholder, never a value. Never put a secret under `config.yml`'s `client:` block, which is served to the browser.

## Check the files are ignored

Before any secret goes into `.env` or `config.yml`, confirm the file is both ignored and untracked, and stop if it is not:

```bash
git check-ignore -q config.yml && ! git ls-files --error-unmatch config.yml >/dev/null 2>&1 && echo 'config.yml: ignored and untracked'
git check-ignore -q .env && ! git ls-files --error-unmatch .env >/dev/null 2>&1 && echo '.env: ignored and untracked'
```

## Let the user set the value

Never ask for the value in the conversation and never write it yourself. Give the user the exact line to add, with a placeholder, and have them add it in their own editor or terminal:

- Option 1: a line in the startup file of the shell that starts the server, such as `export OPENAI_API_KEY='<paste the key here>'` in `~/.zshrc`, or the operating system's user environment on Windows. Then the user opens a new terminal — a running `pnpm dev`, and the agent's own shell, do not see a variable set afterwards.
- Option 2: a line `OPENAI_API_KEY='<paste the key here>'` in `.env`. A literal `$` in the value must be written as `\$`.
- Option 3: the value in `config.yml` in place of the placeholder, in single quotes with each `'` doubled.

Establish the user's operating system and shell from facts that are not secret, and confirm them with the user; the terminal they use may differ from yours. Use the same procedure for `VECTOR_DATABASE_PASSWORD` and `NOCOBASE_API_KEY`.

## Check a variable without printing it

```bash
[ -n "${OPENAI_API_KEY+x}" ] && echo 'OPENAI_API_KEY: set' || echo 'OPENAI_API_KEY: missing'
grep -q '^OPENAI_API_KEY=' .env && echo '.env: has OPENAI_API_KEY' || echo '.env: no OPENAI_API_KEY'
```

Never run anything that prints the environment or a value: no `env`, `printenv`, `set`, `echo $OPENAI_API_KEY`, `cat .env`, printing a shell profile, or printing a `config.yml` that holds a value.

## Use a secret in a command

A command may use a secret by variable name, for example to prove an embedding model or to start the pgvector container. When the value is in `.env` rather than in the agent's environment, the agent may load `.env` for that one command, under these limits:

- load it in a subshell, so the values do not persist in the agent's shell: `( set -a; . ./.env; set +a; <command> )`;
- reference the value only as `$NAME` inside the command, never as a literal;
- never echo it, never enable tracing (`set -x`) or verbose output (`curl -v`, `--trace`), and never send it in a URL that is logged — `google-genai` takes its key in the query string, so give the user that request to run instead;
- print only what proves the result, such as an embedding's length or an HTTP status, never the full request or headers.

```bash
( set -a; . ./.env; set +a
  curl -sS "https://api.openai.com/v1/embeddings" \
    -H "Authorization: Bearer $OPENAI_API_KEY" -H 'Content-Type: application/json' \
    -d '{"model":"text-embedding-3-small","input":"ping"}' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.data?.[0]?.embedding?.length ?? r.error?.message ?? "unexpected response")})' )
```

When the value lives in `config.yml` (option 3), or the agent's shell cannot load it, give the user the command to run in their own terminal instead.
