import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';

import { createStandaloneServer } from '../../server/standalone.js';

export const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost'],
    },
    users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
  },
});
