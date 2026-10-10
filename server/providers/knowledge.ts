import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import KnowledgeAIResources from '../ai/index.js';
import {
  KNOWLEDGE_DOCUMENTS_COLLECTION,
  knowledgeDocuments,
  publicDocuments,
} from '../knowledge-resources.js';
import {
  createKnowledgeService,
  knowledgeServiceToken,
} from '../knowledge-service.js';

/**
 * Wires the knowledge feature into the container and into authorization.
 *
 * `register()` binds the service with the container's own lazy factory, so the
 * database and authorization tokens only need to exist by the time the service
 * is first used. `boot()` registers the declarations a check reads, then hands
 * the AI employee plugin the App's own tool and employee.
 *
 * The AI Employee plugin boots its resources first; this provider is an App
 * contribution and boots after every plugin and core provider, which is what
 * lets the registrar below reuse the plugin's `AIManager` instead of creating
 * one.
 */
export default class KnowledgeProvider extends ServiceProvider<Application> {
  public readonly name = 'app/knowledge';

  public override register(): void {
    this.app.container.singleton(knowledgeServiceToken, (resolver) =>
      createKnowledgeService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(authorizationToken),
      ),
    );
  }

  public override async boot(): Promise<void> {
    const { container } = this.app;

    // Both dependencies are checked by registration rather than resolved
    // unconditionally: a composition that omits the Authorization or AI
    // Employee plugin still boots this App's providers, and mounting the
    // knowledge routes without Authorization still fails loudly when the route
    // factory resolves the token at registration time.
    if (container.has(authorizationToken)) {
      const authz = container.resolve(authorizationToken);

      // Opt the collection into the permission model. Every action the feature
      // checks has to be registered here, including for the root user.
      authz.database.collections.add({
        name: KNOWLEDGE_DOCUMENTS_COLLECTION,
        title: { key: 'knowledge.collection.documents', ns: 'nb3-factory' },
      });

      // The named record access must exist before the composite that offers it,
      // because `define` validates each data scope against the offered options.
      authz.recordAccess.define(publicDocuments);
      const reference = authz.compositeResources.define(knowledgeDocuments);

      authz.ui.sections.add({
        name: 'knowledge',
        title: { key: 'knowledge.section', ns: 'nb3-factory' },
        parent: 'business',
      });
      authz.ui.place(reference, { section: 'knowledge' });
    }

    if (container.has(aiManagerToken)) {
      const ai = container.resolve(aiManagerToken);
      await new KnowledgeAIResources({
        source: 'application',
      }).registerAIResources(ai);
    }
  }
}
