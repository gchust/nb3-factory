import {
  ClientApplication,
  realtimeClientToken,
  toasterToken,
} from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  guardRealtimeReconnect,
  startRealtimeWatchdog,
} from './lib/realtime-watchdog.js';
import { createToaster } from './lib/toaster.js';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = 'nb3-factory/client';
  private previousDocumentTitle: string | undefined;
  private stopRealtimeWatchdog: (() => void) | undefined;
  private restoreRealtimeReconnect: (() => void) | undefined;

  public override register(): void {
    // What plugins and pages report through useToaster() reaches the Toaster in client/react-providers.ts from here.
    this.app.container.instance(toasterToken, createToaster());
    // Register runs after the core provider registered the realtime singleton, and before authorization subscribes.
    // Keeping a failing reconnect from escaping the authentication effect is what lets session preparation reach its
    // bounded wait instead of unmounting the whole signed-in tree.
    const realtime = this.app.container.resolve(realtimeClientToken);
    this.restoreRealtimeReconnect = guardRealtimeReconnect(realtime);
  }

  public override boot(): Promise<void> {
    const configuredTitle = this.app.config.get<unknown>('app.title');
    const title =
      typeof configuredTitle === 'string' && configuredTitle.trim()
        ? configuredTitle.trim()
        : 'NocoBase';
    this.app.refine.setOptions({ title: { text: title } });
    this.previousDocumentTitle = document.title;
    document.title = title;
    return Promise.resolve();
  }

  public override start(): Promise<void> {
    // Boot has created the realtime client that authorization subscribes to, so supervision can begin now.
    this.stopRealtimeWatchdog?.();
    const realtime = this.app.container.resolveIfCreated(realtimeClientToken);
    if (realtime) {
      this.stopRealtimeWatchdog = startRealtimeWatchdog(realtime);
    }
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.stopRealtimeWatchdog?.();
    this.stopRealtimeWatchdog = undefined;
    this.restoreRealtimeReconnect?.();
    this.restoreRealtimeReconnect = undefined;
    if (this.previousDocumentTitle !== undefined) {
      document.title = this.previousDocumentTitle;
    }
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  DefaultClientServiceProvider,
];

export default serviceProviders;
