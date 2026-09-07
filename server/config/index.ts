import { AppConfig } from '@nocobase/app-server/config';
import { coreConfigs } from '@nocobase/app-server';
import { objectProvider } from '@nocobase/config/providers/object';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server/runtime';
import type { ConfigMap } from '@nocobase/config';

/**
 * The in-app notification channel the sales workflows depend on. The
 * notification plugin's config default is `channels: []`, and a deployment
 * config that omits the `notification` section (such as the factory's runtime
 * config) leaves every channel disabled — the lead-assignment,
 * opportunity-win and overdue-reminder workflows would then fail on every run
 * with `Notification Channel "in-app" is not enabled.` This default fills the
 * channel in only when the config declares no channels at all, so an explicit
 * deployment config keeps full control.
 */
const IN_APP_NOTIFICATION_CHANNEL = {
  type: 'in-app',
  enabled: true,
  providers: [{ type: 'database', name: 'primary' }],
} as const;

export function createAppConfig(
  context: ResolvedAppRuntimeConfigContext,
): AppConfig<ResolvedAppRuntimeConfigContext> {
  const config = new AppConfig<ResolvedAppRuntimeConfigContext>(
    [...coreConfigs, ...context.configs],
    {
      context,
      environment: context.environment,
    },
  );
  const configuredPath =
    context.configPath ?? context.environment.APP_CONFIG_FILE;
  const configPath = context.paths.root(configuredPath ?? 'config');

  config.loadFile(configPath, { optional: configuredPath === undefined });

  config.load(
    objectProvider({
      notification: { channels: [IN_APP_NOTIFICATION_CHANNEL] },
    }),
    undefined,
    {
      merge: ({ source, destination }): ConfigMap => {
        const merged = structuredClone(destination);
        const notification = merged.notification as
          { channels?: unknown } | undefined;
        const channels = notification?.channels;
        if (!Array.isArray(channels) || channels.length === 0) {
          const sourceNotification = source.notification as
            { channels?: unknown } | undefined;
          const defaultChannels = sourceNotification?.channels;
          return {
            ...merged,
            notification: {
              ...(notification ?? {}),
              channels: Array.isArray(defaultChannels) ? defaultChannels : [],
            },
          };
        }
        return merged;
      },
    },
  );

  return config;
}
