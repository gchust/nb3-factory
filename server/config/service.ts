import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

/**
 * Service-desk application settings.
 *
 * `enableSampleData` provisions the fictional walkthrough records (three
 * customers, six devices, six tickets and one inspection). It is on for this
 * application; turn it off before a real deployment so no demo row is
 * created. Roles, permission sets and the demo accounts are always
 * provisioned — they are structure, not sample data.
 */
export interface ServiceApplicationConfig {
  enableSampleData: boolean;
}

const service: AppConfigFactory<ServiceApplicationConfig> = defineAppConfig(
  () => ({
    enableSampleData: true,
  }),
);

export default service;
