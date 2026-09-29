import {
  defineClientRouteComponentOverrides,
  type AppClientRouteComponentOverrideDefinition,
} from '@nocobase/app-client/plugins';

// Route overrides cover App routes only: a plugin's Settings and Dev pages are
// not part of `contributions.routes`, so an override cannot name them. The
// application's replacement for the API Keys plugin's Settings page is applied
// where the plugin is registered in `client/plugins.ts` instead.
export const routeComponentOverrides: readonly AppClientRouteComponentOverrideDefinition[] =
  defineClientRouteComponentOverrides([]);

export default routeComponentOverrides;
