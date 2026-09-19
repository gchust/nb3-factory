import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';

import {
  createRecruitmentService,
  type RecruitmentService,
} from '../providers/recruitment.js';

/**
 * Build the recruitment service from the running application so every route
 * module shares one wiring: the default database, the authorization permission
 * sets, the deployment's public mount path, and best-effort storage cleanup.
 */
export function createRecruitmentServiceForApp(
  app: Application,
): RecruitmentService {
  const database = app.container.resolve(databaseManagerToken);
  const authorization = app.container.resolve(authorizationToken);
  const drive = app.container.resolve(driveManagerToken);
  return createRecruitmentService({
    database,
    authorization,
    publicBasePath: app.publicBasePath ?? '',
    removeStoredObject: async ({ disk, key }) => {
      await drive.use(disk).delete(key);
    },
  });
}
