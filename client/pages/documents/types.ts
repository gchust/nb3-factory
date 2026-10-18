/**
 * What the documents API answers, as this page reads it.
 *
 * The server decides `canEdit` and `shared` for every row, so the page never re-derives a rule from ownership or
 * state: it only hides the actions the server already refused.
 */
export interface DocumentSummary {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly canEdit: boolean;
  readonly shared: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DocumentShareSummary {
  readonly userId: string;
  readonly name: string | null;
  readonly username: string | null;
  readonly email: string | null;
  readonly createdAt: string;
}

/** Someone a document may be shared with, as the people picker reads them. */
export interface DocumentShareCandidate {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
  readonly disabledAt: string | null;
}

/** What create and edit send. */
export interface DocumentInput {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

/** The list page hands this to the dialogs rendered in its outlet, so a saved change reloads the list. */
export interface DocumentsOutletContext {
  readonly reload: () => void;
}

/** The detail drawer hands this to the dialogs rendered inside it. */
export interface DocumentDetailOutletContext {
  readonly document: DocumentSummary;
  readonly reloadDocument: () => void;
  readonly reloadList: () => void;
}
