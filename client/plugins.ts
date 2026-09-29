import defaultAccess from '@nocobase/app-plugin-authz-default-access/client';
import sharingRules from '@nocobase/app-plugin-authz-sharing-rules/client';
import restrictionRules from '@nocobase/app-plugin-authz-restriction-rules/client';
import {
  defineClientPlugins,
  defineSettingsRoutes,
  type AppClientPluginRegistration,
  type AppClientPlugins,
  type AppClientSettingsRouteDefinition,
  type AppClientSettingsRoutePageDefinition,
} from '@nocobase/app-client/plugins';
import aiEmployee from '@nocobase/app-plugin-ai-employee/client';
import apiKeys from '@nocobase/app-plugin-api-keys/client';
import authentication from '@nocobase/app-plugin-authentication/client';
import authorization from '@nocobase/app-plugin-authorization/client';
import databaseExplorer from '@nocobase/app-plugin-database-explorer/client';
import users from '@nocobase/app-plugin-users/client';
import notificationInApp from '@nocobase/app-plugin-notification-in-app/client';
import i18n from '@nocobase/app-plugin-i18n/client';
import workflow from '@nocobase/app-plugin-workflow/client';
import notification from '@nocobase/app-plugin-notification/client';
import scheduler from '@nocobase/app-plugin-scheduler/client';
import file from '@nocobase/app-plugin-file/client';
import aiKnowledgeBase from '@nocobase/app-plugin-ai-knowledge-base/client';
import mail from '@nocobase/app-plugin-mail/client';

/**
 * Serves the application's integration-key page from the API Keys plugin's
 * Settings entry.
 *
 * The plugin's own page is self-service: Better Auth's `/api-key` endpoints only
 * act on the caller's keys, and it refuses a `userId` over HTTP, so a supervisor
 * cannot issue a key to the device-platform integration account from it. Route
 * overrides reach App routes only — a plugin's Settings page is not part of
 * `contributions.routes` — so the application keeps the plugin's Settings entry,
 * path and page grant but replaces the component behind it. The plugin's server
 * half, its Better Auth endpoints and its API-key table stay registered as
 * before; only the browser page is the application's.
 */
function apiKeysWithIntegrationAdmin(): AppClientPluginRegistration {
  const registration = apiKeys({ path: '/api-keys' });
  return {
    ...registration,
    routes: registration.routes.map((contribution) =>
      contribution.parent === 'settings'
        ? defineSettingsRoutes(
            contribution.routes.map((route) =>
              isPage(route) && route.name === 'api-keys'
                ? {
                    ...route,
                    componentLoader: () =>
                      import('./pages/service/api-keys/index.js'),
                  }
                : route,
            ),
          )
        : contribution,
    ),
  };
}

function isPage(
  route: AppClientSettingsRouteDefinition,
): route is AppClientSettingsRoutePageDefinition {
  return 'componentLoader' in route;
}

// Array order is contribution order. A plugin is enabled by appearing in this
// list; removing its entry and its import disables it.
const clientPlugins: AppClientPlugins = defineClientPlugins([
  authentication(),
  aiEmployee(),
  authorization(),
  defaultAccess(),
  sharingRules(),
  restrictionRules(),
  databaseExplorer(),
  users({ mount: 'settings', path: '/users' }),
  apiKeysWithIntegrationAdmin(),
  i18n(),
  notificationInApp(),
  workflow(),
  notification(),
  file(),
  scheduler(),
  aiKnowledgeBase(),
  mail(),
]);

export default clientPlugins;
