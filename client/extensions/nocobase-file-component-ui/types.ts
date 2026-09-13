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
  /** Finished upload status label. */
  readonly done?: string;
  /** Upload-in-progress status label. */
  readonly uploading?: string;
  /** Queued upload status label. */
  readonly pending?: string;
  /** Failed upload status label. */
  readonly failed?: string;
  /** Cancel an in-flight upload. */
  readonly cancel?: string;
  /** Previous file in the preview dialog. */
  readonly previous?: string;
  /** Next file in the preview dialog. */
  readonly next?: string;
  /** Too many files selected. */
  readonly tooMany?: string;
  /** A file exceeds the maximum size. */
  readonly tooLarge?: string;
  /** A file type is not allowed. */
  readonly typeNotAllowed?: string;
  /** A file URL is missing or not allowed. */
  readonly urlNotAllowed?: string;
  /** Removing a record failed. */
  readonly removeFailed?: string;
  /** Generic upload failure. */
  readonly uploadFailed?: string;
  /** Preview is still loading. */
  readonly loading?: string;
  /** Preview failed to load. */
  readonly loadFailed?: string;
  /** Fallback action offered when a preview is unavailable. */
  readonly downloadFile?: string;
  /** Message shown when a preview is unavailable. */
  readonly previewUnavailable?: string;
  /** Office Online preview could not load the file. */
  readonly officeFailed?: string;
  /** Office Online requires an internet-accessible absolute URL. */
  readonly officeRequiresUrl?: string;
}

export interface FileUploadFieldProps {
  readonly repository: ClientFileRepository;
  readonly value: readonly FileRecord[];
  readonly onChange: (value: readonly FileRecord[]) => void;
  readonly onError?: (error: Error) => void;
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
}
