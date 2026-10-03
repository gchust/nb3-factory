import {
  defineAppConfig,
  envBoolean,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

export interface ServiceConfig {
  /** Create the demonstration accounts and bind seeded records on startup. */
  demoData: boolean;
  /** Daily plan generation for device inspections. */
  inspectionSchedule: {
    enabled: boolean;
    cron: string;
    timezone: string;
  };
  /** Daily reminder for service orders past their deadline. */
  overdueSchedule: {
    enabled: boolean;
    cron: string;
    timezone: string;
  };
  attachment: {
    /** Drive disk the attachment bytes are stored on. */
    disk: string;
    maxBytes: number;
    allowedExtensions: readonly string[];
  };
  /** Password for the demonstration accounts; unused when `demoData` is false. */
  demoPassword: string;
}

const service: AppConfigFactory<ServiceConfig> = defineAppConfig({
  defaults: () => ({
    // This application ships fixed fictional sample data (orders, inspections,
    // knowledge, engineer profiles), so the matching demonstration accounts are
    // provisioned on every start, including the production preview used for
    // review. `SERVICE_DEMO_DATA=false` disables them for a real deployment
    // that keeps the schema but not the sample accounts.
    demoData: true,
    inspectionSchedule: {
      enabled: true,
      cron: '0 8 * * *',
      timezone: 'Asia/Shanghai',
    },
    overdueSchedule: {
      enabled: true,
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
    },
    attachment: {
      disk: 'local',
      maxBytes: 25 * 1024 * 1024,
      allowedExtensions: ['png', 'docx'],
    },
    demoPassword: 'Service@2026',
  }),
  env: {
    SERVICE_DEMO_DATA: envBoolean('demoData'),
    SERVICE_INSPECTION_CRON: envString('inspectionSchedule.cron'),
    SERVICE_OVERDUE_CRON: envString('overdueSchedule.cron'),
    SERVICE_ATTACHMENT_DISK: envString('attachment.disk'),
  },
});

export default service;
