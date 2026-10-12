# Test notes

Application-owned notes for tests. Tests live under `tests/`, never beside the source, and `vitest.config.ts` discovers
`tests/**/*.test.{ts,tsx}`. Browser tests go in `tests/playwright/` and are skipped by Vitest.

- `tests/logic/materials-authorization.test.ts` — the five acceptance criteria for reading and temporary sharing, each
  driven through the real HTTP endpoints with the three seeded accounts.
- `tests/logic/materials-migration.test.ts` — the migration's `up` and `down` against a real database.
- `tests/logic/materials-seeds.test.ts` — the exact seeded dataset.
- `tests/components/materials-list.test.tsx`, `tests/components/staff-page.test.tsx` — the two pages that carry the
  feature's UI, plus `tests/components/data-table.test.tsx` for the table they share.

Server-side tests start the application through `createAppTest({ createServer: createStandaloneServer })` and open with
`// @vitest-environment node`. Two environment variables are set at the top of each such file and both matter:
`AUTH_SECRET`, and `BETTER_AUTH_TRUSTED_ORIGINS` — a cookie-authenticated write is refused unless its `Origin` is
trusted, and a CSRF refusal is also a `403`, so a permission test would pass for the wrong reason without it. Requests
through the fixture must send `origin: 'http://localhost'`.

Component tests mock `@nocobase/app-client` (`useApiClient`, `useToaster`) and
`@nocobase/app-plugin-authentication/client` (`useAuthentication`) with `vi.hoisted`, keep the real module for
`ApiClientError`, and render through `createMemoryRouter` + `TestI18nProvider`. The API client is driven by
`api.request.mockResolvedValue(...)` / `mockRejectedValue(new ApiClientError(...))`; the mock shape mirrors what the
endpoint answers (`{ data, meta }`). Locale groups are nested in `client/locales/system/`
(`enUS.dataTable.noResults`, `enUS.actions.save`) and flat in `client/locales/` (`enUS['materials.title']`) — read the
right shape or the assertion silently compares against `undefined`.
