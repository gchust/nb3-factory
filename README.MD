# nb3-factory

一个独立的 NocoBase 3 软件工厂实验仓库：你在 GitHub Issue Form 中写业务需求，GitHub Actions 串行调用 Pi 修改应用、自动验证，并向 Issue 指定的长期应用分支发起 Pull Request。

```mermaid
flowchart TD
    Issue["Owner 创建 Issue<br/>指定 apps/name"] --> Queue["全局串行队列"]
    Queue --> Branch{"目标分支存在？"}
    Branch -->|否| Create["从默认分支创建"]
    Branch -->|是| Reuse["复用最新应用代码"]
    Create --> Pi["只读凭据环境中的 Pi"]
    Reuse --> Pi
    Pi --> Verify["检查 + SQLite 重建 + 浏览器冒烟"]
    Verify -->|失败| Repair["最多修复一次"]
    Repair --> Verify
    Verify -->|通过| Final["只读 Job 独立复验 Patch"]
    Final --> Publish["不执行生成代码的 Publisher"]
    Publish --> PR["pi/issue-N → apps/name"]
    PR -->|人工合并| Done["关闭 Issue 并唤醒下一任务"]
```

## 使用前配置

在仓库 `Settings → Secrets and variables → Actions` 中配置：

| 类型     | 名称                           | 必填 | 说明                                                                                               |
| -------- | ------------------------------ | ---- | -------------------------------------------------------------------------------------------------- |
| Secret   | `PI_API_ENDPOINT`              | 是   | Pi 使用的模型 API Base URL                                                                         |
| Secret   | `PI_API_KEY`                   | 是   | 模型 API Key                                                                                       |
| Variable | `PI_MODEL`                     | 是   | 自定义 Provider 中的模型 ID                                                                        |
| Variable | `PI_API_TYPE`                  | 否   | 默认 `openai-completions`；也支持 `openai-responses`、`anthropic-messages`、`google-generative-ai` |
| Variable | `PI_THINKING`                  | 否   | 默认 `high`                                                                                        |
| Variable | `PI_VERSION`                   | 否   | 默认固定为 `0.84.4`                                                                                |
| Variable | `PI_AUTH_HEADER`               | 否   | 默认 `true`，为兼容 API 添加 Bearer Authorization                                                  |
| Variable | `PI_SUPPORTS_DEVELOPER_ROLE`   | 否   | 普通模型默认 `true`；DeepSeek V4 自动使用 `false`，也可显式覆盖                                    |
| Variable | `PI_SUPPORTS_REASONING_EFFORT` | 否   | 默认 `true`；不接受 `reasoning_effort` 的接口可设为 `false`                                        |

通过自定义域名使用 `deepseek-v4-flash` 或 `deepseek-v4-pro` 时，运行器会自动启用 DeepSeek 思考格式、工具调用上下文回放兼容和对应的思考等级，无需让 API 域名包含 `deepseek.com`。

然后在 `Settings → Actions → General → Workflow permissions` 中：

1. 允许工作流读写仓库；
2. 打开 **Allow GitHub Actions to create and approve pull requests**。

不要把 API Key 写入 Issue、仓库文件或 Variable。模型 Secret 只会进入 Pi 执行步骤；Pi 所在 Job 没有仓库写权限。最终复验 Job 同样只有读取权限，拥有仓库写权限的 Publisher 既拿不到模型 Secret，也不执行 Pi 生成的依赖、构建或测试脚本。

## 工作方式

1. 使用 **Pi 搭建任务** Issue Form 创建任务，目标分支使用 `apps/<system-name>`。
2. 目标分支不存在时，工厂从默认分支创建；存在时继续使用它。
3. Pi 只修改本地工作区。流水线会运行类型检查、测试、Lint、格式检查、构建、全新 SQLite Migration/Seed 和真实 Chrome 冒烟验证。
4. 验证失败时按 Issue 设置最多修复一次；仍失败则标记 `pi:failed` 并保留日志 Artifact。
5. 验证通过后，只读 Job 在全新工作区应用 Patch 并独立复验；Publisher 只应用已验证 Patch、提交和 Push，再创建或更新指向目标分支的 PR。
6. 人工合并 PR 后，来源 Issue 自动关闭；同一目标分支上最早的等待任务会自动进入队列。

同一目标分支只能同时有一个未合并的 Pi PR。整个仓库的 Pi 任务也使用一个 `queue: max` 并发组，因此一次只运行一个，最多排队 100 个任务。

## 本地检查工厂脚本

```bash
pnpm factory:test
```

完整应用验证仍使用：

```bash
pnpm check
```

---

# NocoBase 3 Application

A full-stack NocoBase 3 application. The server runs on `@nocobase/app-server` and the browser client is React with Refine, shadcn/ui, and Tailwind CSS.

You own everything in this directory. Add pages, API routes, database tables, and business logic directly here — this is your application's source code, not a framework you extend from the outside.

## Getting started

Start the development server:

```bash
pnpm dev
```

`pnpm dev` starts the API server and the Vite client together, picks free ports if the defaults are taken, and prints the URL to open. Use the printed URL rather than assuming a port.

### Review your configuration

`config.yml` was written when the project was created, carrying the database you chose and a generated `auth.secret`. It gets you running; adjust it for your situation:

- **Database.** Point the connection at the database you actually intend to use — dialect, host, port, and credentials.
- **Where the application is served.** `APP_BASE_PATH` is the public mount path, `/main` by default, so the development URL looks like `http://127.0.0.1:13000/main/`. `APP_SERVER_PORT` and `APP_SERVER_HOST` change what the server binds to.
- **Anything a feature you enable requires** — mail delivery, IM webhooks, storage. `config.example.yml` documents every available option, including sections your `config.yml` does not yet have.

`config.yml` is gitignored because it holds your `auth.secret`. Deploy it through your secret management rather than committing it, and run `pnpm server:config` to see what the application resolved.

To run against a production build instead:

```bash
pnpm build
pnpm start
```

## Project structure

```text
client/                  Browser application
├── routes.ts            Your page routes
├── pages/               Your page components
├── components/          Your components
│   └── ui/              shadcn/ui primitives
├── layouts/             Settings and dev tool shells
├── shell/               Authenticated app shell: header, sidebar, user menu
├── routing/             Route rendering, access checks, loading and error UI
├── locales/             Your translated strings
├── theme/               App-wide theme and light/dark selector
├── extensions/          Application-owned copies of plugin-published UI
├── plugins.ts           Which plugins the browser loads
├── react-providers.ts   Your React context providers
├── service-provider.ts  Your client startup logic
└── runtime.ts           Composition root tying the above together

server/                  API server
├── routes/              Your HTTP endpoints
├── providers/           Your services and their lifecycle
├── config/              Application configuration composition
├── plugins.ts           Which plugins the server loads
├── app.ts               Application assembly
├── runtime.ts           Composition root
├── standalone.ts        Node entry point
└── embedded.ts          Entry point when a host process mounts it

database/
├── migrations/          Your schema history
└── seeds/               Your required initial data

tests/                   Unit and integration tests
e2e/                     Browser tests needing a real server
config.yml               Your configuration, generated at setup; gitignored
config.example.yml       Documented configuration template
skills/                  In-depth development guides for AI agents
```

The three files named `runtime.ts`, `plugins.ts`, and `routes.ts` are composition roots: they list what the application is made of. Reading them tells you what is loaded and in what order.

## Scripts

### Everyday development

| Script       | What it does                                      |
| ------------ | ------------------------------------------------- |
| `pnpm dev`   | Start the API server and client with hot reload   |
| `pnpm build` | Build the client and server into `dist/`          |
| `pnpm start` | Run the built server; requires `pnpm build` first |

### Database

| Script         | What it does                                                                               |
| -------------- | ------------------------------------------------------------------------------------------ |
| `pnpm migrate` | Apply pending migrations from your `database/migrations/` and from every registered plugin |
| `pnpm seed`    | Run seeds from `database/seeds/` and from registered plugins                               |

Migrations also run automatically on startup while `database.migrations.autoRun` is `true` in `config.yml`. Run `pnpm migrate` explicitly when you want to apply a schema change without restarting.

### Checks

| Script               | What it does                                                 |
| -------------------- | ------------------------------------------------------------ |
| `pnpm test`          | Run the test suite once                                      |
| `pnpm test:watch`    | Re-run tests as files change                                 |
| `pnpm test:coverage` | Run tests and write a coverage report                        |
| `pnpm typecheck`     | Typecheck the client, tooling, and server                    |
| `pnpm lint`          | Report lint problems                                         |
| `pnpm fix`           | Fix lint problems, then format                               |
| `pnpm check`         | Everything above plus a build; what to run before committing |

### Plugins

Plugins add features to your application. Let these commands edit `package.json`, `client/plugins.ts`, and `server/plugins.ts` for you rather than editing those files by hand.

| Script                          | What it does                                              |
| ------------------------------- | --------------------------------------------------------- |
| `pnpm plugin:register <name>`   | Install a plugin and wire it into the client and server   |
| `pnpm plugin:unregister <name>` | Remove a plugin and its wiring                            |
| `pnpm plugin:update`            | Upgrade registered plugins and re-sync their agent skills |
| `pnpm plugin:inspect <name>`    | Report a plugin's registration state; read-only           |
| `pnpm plugin:skills:sync`       | Re-copy plugin agent skills into `.agents/skills/`        |

Ordering in `client/plugins.ts` and `server/plugins.ts` is contribution order, and a plugin is enabled by appearing in the array. Reorder entries or pass a plugin its options by hand; leave adding and removing entries to the commands.

### Diagnostics

| Script                | What it does                                                                          |
| --------------------- | ------------------------------------------------------------------------------------- |
| `pnpm server:config`  | Print resolved configuration: paths, database, queue, providers. Secrets are redacted |
| `pnpm client:inspect` | Print the resolved client composition: routes, providers, and which file owns each    |
| `pnpm server:inspect` | Print the resolved server composition                                                 |

These read static declarations. They report what is wired, not whether it works — a passing inspection is not a substitute for tests.

## Configuration

`config.yml` is the single source of configuration, written for you at generation time and yours to edit from there. It is gitignored because it carries your `auth.secret`; deploy it through your secret management rather than committing it. `config.example.yml` documents every available option, including sections the generated file leaves out.

Two settings decide where the application is reachable:

- `APP_BASE_PATH` is the public path the application is mounted at, `/main` by default. The browser API base URL is derived from it as `<APP_BASE_PATH>/api`.
- `APP_PUBLIC_ORIGIN` is the external origin used to build callback and redirect URLs. Set it in production. It must not repeat the base path — the runtime joins the two.

Run `pnpm server:config` to see what the application actually resolved, which is faster than reasoning about precedence between the file, environment variables, and defaults.

## Testing

Tests live in `tests/`, never beside the source they cover. Put logic and integration tests under `tests/logic/` and component tests under `tests/components/`. Tests needing a real server, real authentication, or a real database belong in `e2e/`.

### Notification testing

After signing in with the `notification:test` `send` permission, use the
notification logs settings page to send a real message through the durable
Notification Manager. The form is generated from safe Channel test metadata;
Email tests require an address and IM tests use the configured logical target.
The button is unavailable unless the protected targets endpoint is authorized,
and testing is disabled unless `notification.test.enabled` is explicitly set
to `true` in `config.yml`.

## Working with an AI agent

`AGENTS.md` describes how to build features here, and `skills/` holds the in-depth references it links to. If you use Claude Code, `CLAUDE.md` points at the same guidance. Keeping these accurate as your application grows is what keeps agent-written code consistent with the rest of it.

## License

MIT
