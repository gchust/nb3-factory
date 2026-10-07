/**
 * A project material attachment, as the application's own API returns it.
 *
 * It carries the file record's fields so the file components can render it directly, plus the
 * `contentUrl` the server computes for previewing and downloading the bytes.
 */
export interface MaterialFile {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contentUrl: string;
}

/** One project material with the attachments currently linked to it. */
export interface ProjectMaterial {
  readonly id: number;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly MaterialFile[];
}
