# Server notes for this application

These notes cover application-owned behavior that is easy to undo by accident. Keep them in step with the code.

## Materials and their private attachments

- Schema: `database/main/migrations/202610100900_create_materials.ts` creates `materials` (`title`, `ownerId`, `createdAt`, `updatedAt`) and `material_files` (the file plugin's columns plus `ownerId` and a nullable `materialId`). Both are owned by the signed-in user; there is no shared visibility.
- Domain logic: `server/providers/materials.ts` (`materialsServiceToken`) is the only place that decides who may read or write a material or attach a file. It throws `MaterialsError`, never an HTTP error. Routes map the codes to `ApiError`.
- API: `server/routes/materials.ts` (`GET/POST /api/materials`, `GET/PATCH/DELETE /api/materials/:id`) returns `{ data }`, validates with zod (`server/routes/schemas.ts`), and declares every response with `describeRoute()`.
- Upload exposure: `server/routes/material-files.ts` registers the file plugin exposure named `materialFiles` over the `material_files` collection, disk `local`, and access path `/uploads/materials`. The client uploads through `clientFileRepositoryManagerToken` (`POST /api/materialFiles/uploadOne`).

## Why the file-plugin guard is an HTTP middleware

`server/middleware/material-access.ts` is registered with `app.addHttpMiddleware()` in `server/app.ts`, not as a runtime route contribution.

The registration order is `httpMiddleware` → plugin routes (`addServerPlugins`) → runtime contributions (`addRuntimeContributions`). The upload and byte routes belong to the file plugin, so a guard written as an application API/root route would be mounted _after_ the plugin's route and never run. Middleware is the only application extension point that runs first.

It installs `auth.required()` on `/api/materialFiles/*` (so the plugin's `principal` resolves and the exposure's `create.defaults.ownerId` scoping applies) and an owner check in front of the public byte route. It answers 401 without a session and 404 for a file that is missing or owned by somebody else, so a stranger cannot tell the two apart.

The middleware returns early when `authenticationToken` is not registered: assemblies the runtime tests build without the authentication plugin must still start.

## Demo accounts and seeds

`database/main/seeds/202610100901_materials_demo_accounts.ts` creates the two isolated accounts and the two sample materials. It is idempotent on the email and title, so `pnpm nocobase db apply` on a populated database is a no-op.

The usernames are `materials.owner` and `materials.colleague`. Better Auth's username plugin only accepts 3–30 letters, digits, underscores or dots — **hyphens are rejected with 422 `INVALID_USERNAME`**, so do not "tidy" these into `materials-owner`.

The seed writes the credential account's password with the same scrypt shape Better Auth verifies (`salt:hash`, N=16384, r=16, p=1, 64-byte key). Copying the `hashPassword` helper is deliberate; changing the parameters would silently make the demo logins fail.

## Cookie-authenticated writes need a trusted origin

`auth.required()` rejects a cookie-bearing non-GET request whose `Origin`/`Referer` does not match a trusted origin (`403 INVALID_CSRF_ORIGIN`). Trusted origins come from `app.publicOrigin` (`APP_PUBLIC_ORIGIN`). `pnpm dev` sets it to the local origin; a deployment must set it too, or uploads and saves fail even though sign-in works.
