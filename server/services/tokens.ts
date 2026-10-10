import { createServiceToken } from '@nocobase/service-provider';

/**
 * The outcome of trying to load one device manual into the AI knowledge base.
 *
 * `ready` means the document was accepted and indexed. `pending` means the
 * ingestion pipeline accepted it but has not finished. `failed` carries the
 * reason it could not be indexed, which the manual page shows verbatim — a
 * sandbox without a vector database reports `failed`, never a fake success.
 */
export interface ManualIndexOutcome {
  readonly status: 'ready' | 'pending' | 'failed';
  readonly detail: string;
}

export interface ManualIndexService {
  indexManual(manualId: number): Promise<ManualIndexOutcome>;
}

export const manualIndexServiceToken = createServiceToken<ManualIndexService>(
  'app/service-manual-index',
);

/**
 * What the deployment actually has for the service assistant.
 *
 * Every field is read from the running application: whether the AI employee
 * plugin is registered, whether this application's employee and tool were
 * accepted by its managers, and how many chat model services `ai.llmServices`
 * configures. Nothing here is assumed from the source.
 */
export interface AssistantStatus {
  readonly employee: {
    readonly username: string;
    readonly nickname: string;
    readonly registered: boolean;
  };
  readonly tools: readonly {
    readonly name: string;
    readonly registered: boolean;
  }[];
  readonly llmServices: readonly string[];
  /** True only when the employee is registered and at least one model service is configured. */
  readonly responderReady: boolean;
  /**
   * This application ships no chat surface, so there is no page that could ask
   * a question. It is stated as a constant rather than probed: whether a client
   * bundle contains a chat component is not something the server can observe.
   */
  readonly chatSurface: 'not-installed';
}

export interface AssistantStatusService {
  describe(): Promise<AssistantStatus>;
}

export const assistantStatusServiceToken =
  createServiceToken<AssistantStatusService>('app/service-assistant-status');
