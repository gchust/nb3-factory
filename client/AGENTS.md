# Client application notes

## Internal document library (资料库)

- `client/routes.ts` declares `/materials` (list, `navigation.materials`) and
  `/materials/:materialId` (one document's own address, so a link can be
  reopened). Both use `auth: 'required'` and `authz: 'skip'`: every signed-in
  user may open the pages, and `server/AGENTS.md` explains the server-side
  rule that decides which documents each viewer actually sees.
- `client/pages/materials/` holds the page. `index.tsx` is the list,
  `detail.tsx` a single document, `material-form-dialog.tsx` the create/edit
  form, `share-panel.tsx` the administrator's temporary single-document share,
  and `materials-api.ts` the typed `/api/materials` calls.
- The server decides capability, the page only reflects it: `meta.canCreate`
  gates the create button, `canEdit` the edit/delete controls, and `canShare`
  (root only) the share panel. Never infer a permission in the browser.
- A revoked, unshared, missing or confidential document answers `404`, and
  `detail.tsx` renders the localized "无法查看该资料" card for it.
