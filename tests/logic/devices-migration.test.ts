import path from 'node:path';

import { describeMigration } from '@nocobase/app-testing/server';
describeMigration('202610070001_create_devices', {
  sources: [
    {
      packageName: 'app',
      directory: path.resolve(
        import.meta.dirname,
        '../../database/main/migrations',
      ),
    },
  ],

  async up({ expectCollection }) {
    const devices = expectCollection('devices');
    await devices.toExist();

    await devices.toHaveField('id', {
      type: 'integer',
      nullable: false,
    });
    await devices.toHaveField('code', {
      type: 'string',
      nullable: false,
      length: 64,
    });
    await devices.toHaveField('name', {
      type: 'string',
      nullable: false,
      length: 200,
    });
    await devices.toHaveField('status', {
      type: 'string',
      nullable: false,
      length: 32,
    });
    await devices.toHaveField('notes', {
      type: 'text',
      nullable: true,
    });
    await devices.toHaveField('createdAt', {
      type: 'datetime',
      nullable: false,
    });
    await devices.toHaveField('updatedAt', {
      type: 'datetime',
      nullable: true,
    });

    await devices.toHaveIndex(['code'], { unique: true });
    await devices.toHaveIndex(['status'], { unique: false });
  },

  async down({ expectCollection }) {
    // Not only removed from the metadata: toExist reads the physical schema through the inspector.
    await expectCollection('devices').not.toExist();
  },
});
