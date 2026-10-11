import { defineRecordAccess } from '@nocobase/authorization/core';
import {
  AUTHORIZATION_SETTINGS_SECTION,
  authorizationToken,
} from '@nocobase/app-plugin-authorization';
import {
  anyScope,
  condition,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  userManagementServiceToken,
  type UserManagementService,
} from '@nocobase/app-plugin-users/server';

import { APP_LOCALE_NAMESPACE, documents } from '../documents-resources.js';
import type { DocumentRow } from '../documents-resources.js';
import {
  documentsEditor,
  documentsReader,
} from '../../database/seed-data/permission-sets.ts';

const title = (key: string) => ({ key, ns: APP_LOCALE_NAMESPACE });

/** One row of `documentShares`, read by the `documents.readable` resolver. */
interface DocumentShareRow {
  readonly id: number;
  readonly documentId: number;
  readonly userId: string;
}

/** The reader accounts and the three documents a fresh installation starts with. */
const SAMPLE_EDITOR = {
  name: '资料员甲',
  username: 'jia',
  email: 'jia@example.com',
  password: 'jia123456',
  role: 'documents-editor',
} as const;

const SAMPLE_READER = {
  name: '阅读者乙',
  username: 'yier',
  email: 'yi@example.com',
  password: 'yi123456',
  role: 'documents-reader',
} as const;

/**
 * Registers the document library with the application: its collection in the permission model, the Record Access that
 * decides which documents a person may read, the business capability and its administration surface, and the sample
 * documents and accounts a fresh installation is installed with.
 *
 * The rule this feature turns on — a share opens one draft without ever opening a confidential document — is the
 * resolver below, not the sharing plugin. See `server/AGENTS.md`.
 */
export class DocumentsProvider extends ServiceProvider<Application> {
  name = 'nb3-factory/documents';

  private declared = false;

  // `boot()` may run twice; registering twice would replace the same definitions with identical ones and register
  // the sample data twice, which the sample service rejects.
  async boot(): Promise<void> {
    if (this.declared) {
      return;
    }

    // The authorization plugin owns the service this provider registers into. The application always lists that
    // plugin, but a test or an application that composes the runtime without it must still boot: nothing here can
    // be registered, so leave the container untouched instead of failing startup.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    this.declared = true;

    const authz = this.app.container.resolve(authorizationToken);

    // Every governed Collection is registered explicitly; the DB supplies the field and relation metadata.
    authz.database.collections.add({
      name: 'documents',
      title: title('documents.collection'),
      actions: ['read', 'create', 'update', 'delete'],
    });

    // The one record rule: owned, public, or explicitly shared — and never confidential through a share.
    authz.recordAccess.define(
      defineRecordAccess('documents.readable', (access) =>
        access
          .title(title('documents.recordAccess.readable'))
          .collections('documents')
          .resolver(async ({ principal }) => this.readableScope(principal.id)),
      ),
    );

    const reference = authz.compositeResources.define(documents);

    // `read` opens the administration page; `manage` writes a temporary share. Splitting them keeps a permission
    // set that may only look at the sharing settings from being able to change them.
    authz.settings.add({
      id: 'documents.admin',
      title: title('documents.admin.title'),
      actions: [
        { name: 'read', title: title('documents.admin.actions.read') },
        { name: 'manage', title: title('documents.admin.actions.manage') },
      ],
    });

    authz.ui.place(reference, {
      section: authz.ui.sections.other('business'),
      order: 20,
    });
    authz.ui.place(
      { type: 'settings', id: 'documents.admin' },
      { section: AUTHORIZATION_SETTINGS_SECTION },
    );

    this.app.container.resolve(sampleDataToken).register({
      name: 'nb3-factory/documents',
      packageName: 'nb3-factory',
      run: () => this.buildSampleData(),
    });
  }

  /**
   * The records a person may read, as a scope the Repository applies.
   *
   * A share opens exactly one document and never a confidential one: the share branch carries the same
   * `confidential = false` condition the public branch does, so a share row that names a confidential document still
   * selects nothing. `ownerId` is the one branch that keeps every document with its owner, confidential included.
   */
  private async readableScope(owner: string): Promise<DatabaseScope> {
    const ownerId = owner;
    if (!ownerId) {
      return false;
    }

    const shares = await this.app.container
      .resolve(databaseManagerToken)
      .repository<DocumentShareRow>('documentShares')
      .findMany({
        filter: (filter) => filter.string('userId').eq(ownerId),
      });

    const notConfidential = condition('confidential', '$isFalsy');

    // The scope objects are annotated rather than inferred: a spread in the `anyScope` array below would widen their
    // `kind`/`logic` literals to `string` and stop them matching `DatabaseScope`.
    const publicScope: DatabaseScope = {
      kind: 'group',
      logic: 'and',
      items: [condition('published', '$isTruly'), notConfidential],
    };
    const shareScopes: DatabaseScope[] = shares.map((share) => ({
      kind: 'group',
      logic: 'and',
      items: [condition('id', '$eq', share.documentId), notConfidential],
    }));

    return anyScope([
      condition('ownerId', '$eq', ownerId),
      publicScope,
      ...shareScopes,
    ]);
  }

  private async buildSampleData(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);
    const manager = this.app.container.resolve(databaseManagerToken);
    const users = this.app.container.resolve(userManagementServiceToken);

    // The permission sets are required data and normally come from a seed; make sure they exist here too so
    // `db sample` works on an installation whose seeds were not run.
    for (const permissionSet of [documentsEditor, documentsReader]) {
      if (!(await authz.permissionSets.get(permissionSet.key))) {
        await authz.permissionSets.create({
          key: permissionSet.key,
          title: permissionSet.title,
          grants: permissionSet.grants,
        });
      }
    }

    const editor = await this.ensureUser(users, SAMPLE_EDITOR);
    await this.ensureUser(users, SAMPLE_READER);
    const repository = manager.repository<DocumentRow>('documents');
    const existing = await repository.findMany({
      filter: (filter) => filter.string('ownerId').eq(editor.id),
    });
    if (existing.length) {
      return;
    }

    const now = new Date();
    const samples = [
      {
        title: '公开资料 P',
        body: '这是一份已发布且不保密的资料，所有拥有资料读取权限的同事都可以查看。',
        ownerId: editor.id,
        published: true,
        confidential: false,
      },
      {
        title: '私有草稿 D',
        body: '这是一份尚未发布的草稿，默认只有负责人自己可以看到。',
        ownerId: editor.id,
        published: false,
        confidential: false,
      },
      {
        title: '保密资料 C',
        body: '这是一份保密资料，除负责人本人外，任何人都不能查看，包括临时共享。',
        ownerId: editor.id,
        published: false,
        confidential: true,
      },
    ] as const;

    for (const sample of samples) {
      await repository.createOne({
        values: { ...sample, createdAt: now, updatedAt: now },
      });
    }
  }

  private async ensureUser(
    users: UserManagementService,
    sample: {
      readonly name: string;
      readonly username: string;
      readonly email: string;
      readonly password: string;
      readonly role: string;
    },
  ) {
    const page = await users.list({ search: sample.email, pageSize: 1 });
    const found = page.items[0];
    if (found) {
      return found;
    }
    return users.create({
      name: sample.name,
      username: sample.username,
      email: sample.email,
      password: sample.password,
      roleScopes: { app: [sample.role] },
    });
  }
}

export default DocumentsProvider;
