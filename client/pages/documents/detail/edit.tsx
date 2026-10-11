// `/documents/:documentId/edit` — the edit dialog stacked on the detail drawer. It is the same dialog as
// `/documents/edit/:documentId`, reading `DocumentEditContext` from whichever view rendered it, so both routes share
// one component.
export { default } from '../edit.js';
