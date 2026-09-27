/** A document as the library endpoints return it. */
export interface DocumentRecord {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName?: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What the create and edit forms send. */
export interface DocumentDraft {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

/** One temporary grant of reading a document to a user. */
export interface DocumentShare {
  readonly ruleKey: string;
  readonly userId: string;
  readonly subjectType: string;
}

/** A user the share form can pick. */
export interface LibraryUser {
  readonly id: string;
  readonly name: string;
  readonly username?: string;
  readonly email: string;
}

/** What the list page passes to its child routes through `<Outlet context>`. */
export interface LibraryOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/** What the detail drawer passes to the dialogs stacked on it. */
export interface LibraryDetailOutletContext {
  /** The record the drawer is showing, absent until it loads. */
  readonly document: DocumentRecord | null;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (document: DocumentRecord) => void;
}
