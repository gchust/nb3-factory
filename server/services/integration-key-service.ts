import type { DatabaseManager } from '@nocobase/db';
import { ApiKeyService } from '@nocobase/app-plugin-api-keys/server';
import type {
  Auth,
  UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import { invalid, notFound, type ServiceActor } from './contracts.js';
import type { AccessService } from './access-service.js';

/** The API Key configuration the application's auth config registers. */
const API_KEY_CONFIG_ID = 'default';

/**
 * The narrow read projection used to list keys.
 *
 * Only the identifying and lifecycle columns are read; the `key` column holds a
 * hash and is never selected. The plugin owns writes, so this service never
 * inserts or updates a row directly — it goes through `ApiKeyService`.
 */
interface ApiKeyRow {
  id: string;
  name?: string | null;
  prefix?: string | null;
  start?: string | null;
  enabled: boolean;
  expiresAt?: Date | string | null;
  lastRequest?: Date | string | null;
  createdAt?: Date | string | null;
  referenceId: string;
}

export interface IntegrationKeyView {
  id: string;
  name: string;
  /** The recognizable first characters of the key, never the secret. */
  hint: string;
  enabled: boolean;
  expiresAt?: string | null;
  lastRequest?: string | null;
  createdAt?: string | null;
  userId: string;
}

export interface IntegrationKeyUserView {
  id: string;
  name: string;
  username?: string | null;
  email: string;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * Administration of the device platform's API keys.
 *
 * Better Auth's own HTTP endpoints act only on the caller's keys, so an
 * administrator cannot issue a key to the integration account through them.
 * This service is the trusted, server-side path: it authorizes the actor, then
 * uses the plugin's `ApiKeyService` to write the credential. Keys are listed
 * through a read-only projection that never exposes the stored hash.
 */
export class IntegrationKeyService {
  private readonly db: DatabaseManager;
  private readonly access: AccessService;
  private readonly keys: ApiKeyService;
  private readonly users: UserAdministrationService;

  constructor(
    db: DatabaseManager,
    access: AccessService,
    auth: Auth,
    users: UserAdministrationService,
    keys?: ApiKeyService,
  ) {
    this.db = db;
    this.access = access;
    this.keys = keys ?? new ApiKeyService(auth, API_KEY_CONFIG_ID);
    this.users = users;
  }

  /** Accounts an administrator may bind an integration key to. */
  async listTargets(actor: ServiceActor): Promise<IntegrationKeyUserView[]> {
    this.access.assertSupervisor(actor);
    const ids = await this.access.listUserIdsByRole('integration');
    // The actor is always selectable, so a supervisor can also manage its own
    // automation key from the same page.
    if (!ids.includes(actor.id)) {
      ids.push(actor.id);
    }
    if (ids.length === 0) {
      return [];
    }
    const page = await this.users.list({ userIds: ids, pageSize: ids.length });
    return page.items.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username ?? null,
      email: user.email,
    }));
  }

  async listKeys(
    actor: ServiceActor,
    requestedUserId?: string,
  ): Promise<IntegrationKeyView[]> {
    const userId = requestedUserId?.trim() || actor.id;
    this.assertMayManage(actor, userId);
    const rows = await this.db.repository<ApiKeyRow>('apikey').findMany({
      filter: { referenceId: userId },
      sort: (sort) => [sort.field('createdAt').desc()],
    });
    return rows.map((row) => this.toView(row));
  }

  async createKey(
    actor: ServiceActor,
    input: { userId?: string; name: string; expiresIn?: number | null },
  ): Promise<{ key: IntegrationKeyView; secret: string }> {
    const userId = input.userId?.trim() || actor.id;
    this.assertMayManage(actor, userId);
    const name = input.name?.trim();
    if (!name) {
      throw invalid('Give the key a name so it can be recognized later.');
    }
    const target = await this.users.get(userId);
    if (!target) {
      throw notFound('The target account does not exist.');
    }
    if (target.disabledAt) {
      throw invalid('A disabled account cannot receive an API key.');
    }
    const { key, secret } = await this.keys.create({
      userId,
      name,
      expiresIn: input.expiresIn ?? null,
    });
    return { key: this.toView(key), secret };
  }

  async revokeKey(actor: ServiceActor, keyId: string): Promise<void> {
    const row = await this.db
      .repository<ApiKeyRow>('apikey')
      .findOne({ filter: { id: keyId } });
    if (!row) {
      throw notFound('That API key does not exist.');
    }
    this.assertMayManage(actor, row.referenceId);
    await this.keys.remove(keyId);
  }

  /** The actor may manage its own keys; another user's only as a supervisor. */
  private assertMayManage(actor: ServiceActor, userId: string): void {
    if (userId === actor.id) {
      return;
    }
    this.access.assertSupervisor(actor);
  }

  private toView(row: ApiKeyRow): IntegrationKeyView {
    const hint = row.start ?? (row.prefix ? `${row.prefix}…` : '••••••••');
    return {
      id: row.id,
      name: row.name ?? '',
      hint,
      enabled: row.enabled !== false,
      expiresAt: toIso(row.expiresAt),
      lastRequest: toIso(row.lastRequest),
      createdAt: toIso(row.createdAt),
      userId: row.referenceId,
    };
  }
}
