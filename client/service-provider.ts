import { ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

// The application's own i18n namespace. The sidebar resolves `meta.i18nNs` with
// react-i18next's `t`, which only understands real registered namespaces — the
// APP_NS sentinel is resolved solely by the runtime's `getFixedT`. Using the
// package name (as plugins do with `this.name`) makes the label translate.
// `create-app` rewrites this literal to the generated application's package name.
const APP_NAMESPACE = 'nb3-factory';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = 'nb3-factory/client';
  private previousDocumentTitle: string | undefined;

  public override boot(): Promise<void> {
    const configuredTitle = this.app.config.get<unknown>('app.title');
    const title =
      typeof configuredTitle === 'string' && configuredTitle.trim()
        ? configuredTitle.trim()
        : 'NocoBase';
    this.app.refine.setOptions({ title: { text: title } });
    this.previousDocumentTitle = document.title;
    document.title = title;

    this.app.refine.addResources([
      {
        name: 'team-todos',
        list: '/team-todos',
        meta: { label: 'navigation.teamTodos', i18nNs: APP_NAMESPACE },
      },
    ]);

    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
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
