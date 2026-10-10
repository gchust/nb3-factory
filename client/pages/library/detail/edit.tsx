/**
 * `/library/:documentId/edit`: the edit dialog stacked on the detail drawer.
 * It shares the component with `/library/edit/:documentId`; which view is
 * behind it decides what `<Outlet context>` it reads.
 */
export { default } from '../edit.js';
