# Document library

Read this before changing the library's pages, endpoints, permission sets or starting content.

## Scope

The library is an internal reading system. `documents` holds a title, body, owner, `published` and `confidential`; `documentShares` is an administrator's temporary grant of one draft to one reader. There are no departments, attachments, search, versioning or approvals. A document's owner is the only person who can edit or delete it; sharing never implies editing.

Visibility is a server decision in `server/providers/library.ts`:

- `library.visible` — the viewer owns the document, or it is published and not confidential.
- `library.readable` — `library.visible`, plus a matching row in `documentShares` while the document is non-confidential. A share of a confidential document remains invisible.
- `recordsIOwn` scopes create, edit and delete to the owner.

The permission sets `library-maintainer` and `library-reader` are seeded in `database/main/seeds/202610200001_library_permission_sets.ts`. They are immutable history: change runtime grants with a new seed or migration, never by editing that seed after it has been installed.

## Starting content

`database/main/seeds/202610200002_library_sample_records.ts` is `sample: true` and creates the requested three documents and two accounts:

| Account  | Sign-in                         | Password     | Permission set       |
| -------- | ------------------------------- | ------------ | -------------------- |
| 资料员甲 | `jia` or `jia@example.com`      | `library123` | `library-maintainer` |
| 阅读者乙 | `yi_reader` or `yi@example.com` | `library123` | `library-reader`     |

The documents are P (`公开资料 P`, published, not confidential), D (`私有草稿 D`, draft owned by 甲) and C (`保密资料 C`, published and confidential, owned by 甲). The administrator remains the installation's own admin account.

`server/config/app.ts` defaults `app.sampleData` to true because these records are part of this application's requested starting state. A deployment that does not want fictional accounts sets `APP_SAMPLE_DATA=false`; tests set it to false so their installations remain administrator-only.
