import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
  envStrings,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

/**
 * Configuration of the application's after-sales service module.
 *
 * Everything editable lives here rather than in the business code: the inspection
 * schedule, the attachment limits, which external notification channels (if any)
 * are configured, and whether the service assistant may answer. Each value has an
 * environment variable, so a deployment never edits source to change behaviour.
 */
export interface ServiceModuleConfig {
  inspection: {
    /** Five-field cron in `inspection.timezone`; 09:00 every day by default. */
    cron: string;
    timezone: string;
    /** A ticket is overdue this many hours after its due date. */
    overdueGraceHours: number;
  };
  attachments: {
    /** Drive disk that stores uploaded attachments; must exist in `drive.disks`. */
    disk: string;
    maxSizeMb: number;
    allowedExtensions: readonly string[];
  };
  notifications: {
    /**
     * External notification channels this application has configured, such as
     * `mail`. Empty means none: the application then records that external
     * delivery is not configured instead of pretending it was sent.
     */
    externalChannels: readonly string[];
  };
  assistant: {
    enabled: boolean;
    maxResults: number;
  };
}

const DEFAULT_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
] as const;

const service: AppConfigFactory<ServiceModuleConfig> = defineAppConfig({
  defaults: {
    inspection: {
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      overdueGraceHours: 0,
    },
    attachments: {
      disk: 'local',
      maxSizeMb: 10,
      allowedExtensions: DEFAULT_EXTENSIONS,
    },
    notifications: { externalChannels: [] },
    assistant: { enabled: true, maxResults: 5 },
  },
  env: {
    SERVICE_INSPECTION_CRON: envString('inspection.cron'),
    SERVICE_INSPECTION_TIMEZONE: envString('inspection.timezone'),
    SERVICE_INSPECTION_OVERDUE_GRACE_HOURS: envInteger(
      'inspection.overdueGraceHours',
    ),
    SERVICE_ATTACHMENT_DISK: envString('attachments.disk'),
    SERVICE_ATTACHMENT_MAX_MB: envInteger('attachments.maxSizeMb'),
    SERVICE_ATTACHMENT_EXTENSIONS: envStrings(
      'attachments.allowedExtensions',
      ',',
    ),
    SERVICE_EXTERNAL_CHANNELS: envStrings(
      'notifications.externalChannels',
      ',',
    ),
    SERVICE_ASSISTANT_ENABLED: envBoolean('assistant.enabled'),
    SERVICE_ASSISTANT_MAX_RESULTS: envInteger('assistant.maxResults'),
  },
});

export default service;
