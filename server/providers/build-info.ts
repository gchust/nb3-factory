import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface BuildInfo {
  readonly name: string;
  readonly startedAt: string;
  readonly nodeVersion: string;
}

export interface BuildInfoService {
  get(): BuildInfo;
}

export const buildInfoServiceToken: ServiceToken<BuildInfoService> =
  createServiceToken<BuildInfoService>('app/build-info-service');

export const FALLBACK_APPLICATION_NAME = 'NocoBase';

/**
 * Reads `client.app.title` from the application configuration, which is the name the product presents. Falls back to
 * the framework's own application name when no title is configured.
 */
export function resolveApplicationName(
  clientConfig: unknown,
  fallback: string = FALLBACK_APPLICATION_NAME,
): string {
  const title = (clientConfig as { app?: { title?: unknown } } | undefined)?.app
    ?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : fallback;
}

/** The moment the server process started, derived from its uptime rather than a per-request clock. */
export function resolveProcessStartedAt(
  now: number,
  uptimeSeconds: number,
): Date {
  return new Date(now - uptimeSeconds * 1000);
}

export function createBuildInfoService(options: {
  readonly name: string;
  readonly startedAt: Date;
  readonly nodeVersion: string;
}): BuildInfoService {
  return {
    get: () => ({
      name: options.name,
      startedAt: options.startedAt.toISOString(),
      nodeVersion: options.nodeVersion,
    }),
  };
}

export default class BuildInfoProvider extends ServiceProvider<Application> {
  public readonly name = 'app/build-info-provider';

  public override register(): void {
    this.app.container.singleton(buildInfoServiceToken, () =>
      createBuildInfoService({
        name: resolveApplicationName(
          this.app.config.get('client'),
          this.app.appName,
        ),
        startedAt: resolveProcessStartedAt(Date.now(), process.uptime()),
        nodeVersion: process.version,
      }),
    );
  }
}
