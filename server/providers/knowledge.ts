import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  KNOWLEDGE_MATERIALS_COLLECTION,
  knowledgeMaterialsResource,
} from '../knowledge/resources.js';
import {
  KnowledgeService,
  knowledgeServiceToken,
} from '../knowledge/service.js';

/** The subsection of the permission workspace that lists the materials resource. */
const KNOWLEDGE_SECTION = 'knowledge';

/**
 * Teaches the authorization layer about materials, then exposes the reader that applies it.
 *
 * The composite resource must be registered before the Authorization provider's `start()`, which validates every
 * stored grant; every provider's `register()` runs before any `boot()`, and every `boot()` before any `start()`, so
 * registering here is early enough for the seeded grants to expand on the very first boot.
 */
export class KnowledgeProvider extends ServiceProvider<Application> {
  readonly name = 'knowledge';

  register(): void {
    this.app.container.singleton(
      knowledgeServiceToken,
      (container) =>
        new KnowledgeService(
          container.resolve(authorizationToken),
          container.resolve(databaseManagerToken),
        ),
    );
  }

  async boot(): Promise<void> {
    // The application-owned providers are also registered in environments that
    // compose a subset of the plugins (the runtime/provider tests register them
    // with no plugins at all). The composite resource and its workspace only make
    // sense when the Authorization service exists, so skip registration rather
    // than failing startup when the plugin is absent.
    if (!this.app.container.has(authorizationToken)) return;

    const authorization: AppAuthorization =
      this.app.container.resolve(authorizationToken);

    authorization.database.collections.add({
      name: KNOWLEDGE_MATERIALS_COLLECTION,
      title: { key: 'knowledge.collection.materials', ns: 'nb3-factory' },
      actions: ['read', 'create', 'update'],
    });
    authorization.ui.sections.add({
      name: KNOWLEDGE_SECTION,
      title: { key: 'knowledge.section.title', ns: 'nb3-factory' },
      parent: 'business',
      order: 10,
    });
    const reference = authorization.compositeResources.define(
      knowledgeMaterialsResource,
    );
    authorization.ui.place(reference, { section: KNOWLEDGE_SECTION });
  }
}
