import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  RecruitingService,
  recruitingServiceToken,
  CANDIDATE_FIELDS,
  EVALUATION_FIELDS,
  INTERVIEW_FIELDS,
  OFFER_FIELDS,
  REQUISITION_FIELDS,
} from './recruiting-service.js';

/**
 * Registers the recruiting collections with the authorization registry (so Permission Sets can grant access,
 * configure fields, and apply record policies), and provides the recruiting service.
 *
 * The registry does not create tables — the migration beside this provider owns the schema. Registering here keeps
 * authorization's view of each collection in one place instead of scattering resource ids through the routes.
 */
interface CollectionDefinition {
  readonly name: string;
  readonly title: string;
  readonly actions: readonly string[];
  readonly fields: readonly string[];
  readonly attributes?: Readonly<Record<string, string>>;
}

const COLLECTION_DEFINITIONS: readonly CollectionDefinition[] = [
  {
    name: 'recruitingRequisitions',
    title: 'Job requisitions',
    actions: ['read', 'create', 'update', 'delete'],
    fields: REQUISITION_FIELDS,
  },
  {
    name: 'recruitingCandidates',
    title: 'Candidates',
    actions: ['read', 'create', 'update', 'delete'],
    fields: CANDIDATE_FIELDS,
  },
  {
    name: 'recruitingInterviews',
    title: 'Interviews',
    actions: ['read', 'create', 'update', 'delete'],
    fields: INTERVIEW_FIELDS,
    attributes: { owner: 'interviewerId' },
  },
  {
    name: 'recruitingEvaluations',
    title: 'Interview evaluations',
    actions: ['read', 'create', 'update', 'delete'],
    fields: EVALUATION_FIELDS,
    attributes: { creator: 'createdById' },
  },
  {
    name: 'recruitingOffers',
    title: 'Offers',
    actions: ['read', 'create', 'update', 'delete'],
    fields: OFFER_FIELDS,
  },
];

export default class RecruitingProvider extends ServiceProvider<Application> {
  public readonly name = 'app/recruiting';

  public override register(): void {
    this.app.container.singleton(recruitingServiceToken, (container) => {
      return new RecruitingService(container.resolve(databaseManagerToken));
    });
  }

  public override boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();
    const authorization = this.app.container.resolve(authorizationToken);
    for (const definition of COLLECTION_DEFINITIONS) {
      if (authorization.database.collections.get(definition.name)) continue;
      authorization.database.collections.add({
        name: definition.name,
        title: definition.title,
        actions: [...definition.actions],
        fields: [...definition.fields],
        ...(definition.attributes ? { attributes: definition.attributes } : {}),
      });
    }
    return Promise.resolve();
  }
}
