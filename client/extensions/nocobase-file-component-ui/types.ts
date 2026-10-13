import type { ReactNode } from 'react';
import type {
  ClientFileRepository,
  FileRecord,
} from '@nocobase/app-plugin-file/client';

export type { FileRecord } from '@nocobase/app-plugin-file/client';
export type FileUploadStatus = 'idle' | 'uploading' | 'error';

export interface FileUiLabels {
  readonly choose?: string;
  readonly empty?: string;
  readonly preview?: string;
  readonly download?: string;
  readonly remove?: string;
  readonly retry?: string;
}

export interface FileUploadFieldProps {
  readonly repository: ClientFileRepository;
  readonly value: readonly FileRecord[];
  readonly onChange: (value: readonly FileRecord[]) => void;
  readonly onError?: (error: Error) => void;
  /**
   * Optional content check for a chosen file before it is uploaded. Return a user-facing message to reject the
   * file, or `null`/`undefined` to accept it. It runs after the `accept` rules and the size limit, so it is where
   * a screenshot whose bytes do not match its extension can be caught — the browser's `accept` filter only looks
   * at the name. A rejected file stays in the list marked as failed, with its message.
   */
  readonly validate?: (
    file: File,
  ) => Promise<string | null | undefined> | string | null | undefined;
  readonly onStatusChange?: (status: FileUploadStatus) => void;
  readonly multiple?: boolean;
  readonly accept?: readonly string[];
  readonly maxSize?: number;
  readonly maxFiles?: number;
  readonly disabled?: boolean;
  /** Deletes metadata only; false removes the selection without deleting a record. */
  readonly removeOnDelete?: boolean;
  readonly labels?: FileUiLabels;
}

export interface FileListProps {
  readonly files: readonly FileRecord[];
  readonly onPreview?: (file: FileRecord) => void;
  readonly onDownload?: (file: FileRecord) => void;
  readonly onRemove?: (file: FileRecord) => void | Promise<void>;
  readonly onError?: (error: Error) => void;
  readonly labels?: FileUiLabels;
  readonly emptyState?: ReactNode;
}

export interface FilePreviewDialogProps {
  readonly files: readonly FileRecord[];
  readonly initialIndex?: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onError?: (error: Error) => void;
  readonly download?: boolean;
  readonly labels?: FileUiLabels;
}

export interface FilePreviewFieldProps {
  readonly files: readonly FileRecord[];
  readonly labels?: FileUiLabels;
  readonly emptyState?: ReactNode;
  readonly showFilenames?: boolean;
  readonly onError?: (error: Error) => void;
}

export interface FileThumbnailProps {
  readonly file: FileRecord;
  readonly url?: string;
  readonly alt?: string;
  /** Show the file-type icon without loading the image. */
  readonly iconOnly?: boolean;
}
