import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';
import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { type AuthorizationConfig } from '@nocobase/app-plugin-authorization/server';
import { serviceAuthorization } from '../service-authorization.js';

// Permission sets, page and database authorization are built in.
const authorization: AppConfigFactory<AuthorizationConfig> = defineAppConfig(
  (_runtime) => ({
    permissionSets: { rootSet: 'root', defaultSet: 'member' },
    plugins: [
      defaultAccess(),
      sharingRules(),
      restrictionRules(),
      serviceAuthorization(),
    ],
  }),
);

export default authorization;
