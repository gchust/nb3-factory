export interface DocumentRecord {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly ownerId: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DocumentInput {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export interface DocumentRoleUser {
  readonly id: string;
  readonly name: string;
  readonly username?: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly disabledAt: string | null;
}

export interface OptionText {
  readonly key: string;
  readonly ns?: string;
}

export interface SubjectOption {
  readonly id: string;
  readonly title: string | OptionText;
  readonly description?: string | OptionText;
}

export interface RecordOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export interface SharingRuleAction {
  readonly action: string;
  readonly scopeKey?: string;
  readonly selection: {
    readonly type: 'records' | 'recordAccess';
    readonly ids?: readonly string[];
    readonly key?: string;
  };
}

export interface SharingRule {
  readonly key: string;
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly SharingRuleAction[];
  readonly title?: string | OptionText;
  readonly subjects: readonly { readonly type: string; readonly id: string }[];
  readonly reason?: string;
}
