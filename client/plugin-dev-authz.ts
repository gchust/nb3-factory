import {
  defineClientPlugins,
  defineDevRoutes,
  isAppClientDevRouteGroup,
  type AppClientDevRouteDefinition,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';

const legacyDevPaths = new Map([
  [
    '@nocobase/app-plugin-ai-knowledge-base',
    new Set([
      'ai-knowledge-base/ai-knowledge-base-directory',
      'ai-knowledge-base/ai-knowledge-base-documents',
      'ai-knowledge-base/ai-knowledge-base-upload',
      'ai-knowledge-base/ai-knowledge-base-segments',
      'ai-knowledge-base/ai-knowledge-base-hit-tests',
      'ai-knowledge-base/ai-knowledge-base-workspace',
    ]),
  ],
  [
    '@nocobase/app-plugin-mail',
    new Set([
      'mail/send/compose',
      'mail/send/bulk',
      'mail/logs/send',
      'mail/logs/bulk',
      'mail/logs/sync',
    ]),
  ],
]);

function explicitDevAuthz(
  route: AppClientDevRouteDefinition,
  knownPaths: ReadonlySet<string>,
  ancestors: readonly string[] = [],
): AppClientDevRouteDefinition {
  const names = [...ancestors, route.name];
  const children = route.children?.map((child) =>
    explicitDevAuthz(child, knownPaths, names),
  );
  if (
    !isAppClientDevRouteGroup(route) &&
    route.authz === undefined &&
    knownPaths.has(names.join('/'))
  ) {
    return {
      ...route,
      authz: 'skip' as const,
      ...(children ? { children } : {}),
    };
  }
  return children ? { ...route, children } : route;
}

/**
 * Knowledge Base beta.9 and Mail beta.0 omit authz on known Dev pages,
 * which app-client beta.20 now requires. Preserve their former implicit skip
 * (including Mail's ancestor guards and login requirements) in our own
 * registration data; component overrides cannot change route authorization.
 * Remove this adapter once both installed plugins declare these guards.
 */
export function withLegacyPluginDevAuthz(
  plugins: AppClientPlugins,
): AppClientPlugins {
  return defineClientPlugins(
    plugins.plugins.map((plugin) => {
      const knownPaths = legacyDevPaths.get(plugin.packageName);
      if (!knownPaths) {
        return plugin;
      }
      return {
        ...plugin,
        routes: plugin.routes.map((contribution) =>
          contribution.parent === 'dev'
            ? defineDevRoutes(
                contribution.routes.map((route) =>
                  explicitDevAuthz(route, knownPaths),
                ),
              )
            : contribution,
        ),
      };
    }),
  );
}
