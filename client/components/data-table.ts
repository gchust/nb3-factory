// The directory's entry point. `#components/*` maps to `client/components/*.js`, so this file makes
// `#components/data-table` resolve while the components themselves live in `client/components/data-table/`.
export { DataTable, type DataTableProps } from './data-table/data-table.js';
