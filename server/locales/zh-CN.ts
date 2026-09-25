import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  overrides: {
    // The application's external test provider ships its English label from the server definition; this is the
    // Chinese wording for the notification test dialog on the diagnostics page.
    '@nocobase/app-plugin-notification': {
      test: {
        providers: {
          externalReceiver: '外部测试接收器',
        },
      },
    },
  },
};

export default zhCN;
