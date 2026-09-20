import { defineAppConfig, type AppConfigFactory } from '@nocobase/app-client';

const app: AppConfigFactory<{ title: string }> = defineAppConfig(
  (_runtime) => ({
    title: '团队资料借阅',
  }),
);
export default app;
