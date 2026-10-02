import { randomUUID } from 'node:crypto';

import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { DatabaseManager } from '@nocobase/db';

import { authorizeComposite, scopedConnection } from './authorization.js';
import { invalid, notFound } from './errors.js';
import type { ServiceAttachmentRow, ServiceWorkOrderRow } from './models.js';

/** The only two formats the work order accepts: an on-site PNG and a DOCX repair report. */
export const ALLOWED_ATTACHMENT_EXTENSIONS = ['png', 'docx'] as const;

export type AttachmentContentError =
  'unsupported-type' | 'damaged-png' | 'damaged-docx';

/**
 * A file whose extension is allowed can still be damaged or mislabelled. Check the leading bytes so a corrupt
 * upload is refused with a clear message instead of being stored and later failing to preview.
 */
export function attachmentContentError(
  ext: string,
  bytes: Uint8Array,
): AttachmentContentError | undefined {
  const normalized = ext.replace(/^\./, '').toLowerCase();
  if (normalized === 'png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const valid =
      bytes.length >= signature.length &&
      signature.every((byte, index) => bytes[index] === byte);
    return valid ? undefined : 'damaged-png';
  }
  if (normalized === 'docx') {
    // A DOCX is an OPC package, so it must begin with a ZIP local-file, empty-archive or data-descriptor header.
    const valid =
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
      (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
    return valid ? undefined : 'damaged-docx';
  }
  return 'unsupported-type';
}

/** Localized wording for the attachment rejection, so the upload feedback follows the request language. */
export function attachmentContentErrorText(
  code: AttachmentContentError,
  locale: string | null | undefined,
): string {
  const chinese = locale?.toLowerCase().startsWith('zh');
  switch (code) {
    case 'unsupported-type':
      return chinese
        ? '仅接受 PNG 现场照片和 DOCX 维修报告。'
        : 'Only PNG photos and DOCX repair reports are accepted.';
    case 'damaged-png':
      return chinese
        ? '该 PNG 文件已损坏或不是有效的 PNG 图片。'
        : 'The PNG file is damaged or not a real PNG image.';
    case 'damaged-docx':
      return chinese
        ? '该 DOCX 文件已损坏或不是有效的 DOCX 文档。'
        : 'The DOCX file is damaged or not a real DOCX document.';
  }
}

export interface ServiceAttachmentInput {
  workOrderId: number;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
}

export interface ServiceAttachmentService {
  /** List a work order's attachments, only for a principal who may read the work order. */
  list(
    context: AuthorizationContext,
    workOrderId: number,
  ): Promise<ServiceAttachmentRow[]>;
  /** Save an already-stored file's metadata and link it to the work order. */
  create(
    context: AuthorizationContext,
    input: ServiceAttachmentInput,
  ): Promise<ServiceAttachmentRow>;
  /** Remove one attachment's link; the caller still needs read access to its work order. */
  remove(context: AuthorizationContext, id: string): Promise<void>;
  /** Read one attachment for the preview/download route, scoped to the work order it belongs to. */
  get(
    context: AuthorizationContext,
    id: string,
  ): Promise<ServiceAttachmentRow | undefined>;
}

function now(): Date {
  return new Date();
}

export interface ServiceAttachmentServiceDependencies {
  database: DatabaseManager;
}

export function createServiceAttachmentService({
  database,
}: ServiceAttachmentServiceDependencies): ServiceAttachmentService {
  const system = database.connection();

  async function assertWorkOrderVisible(
    context: AuthorizationContext,
    workOrderId: number,
  ): Promise<void> {
    const policies = await authorizeComposite(
      context,
      'service.workOrders',
      'view',
    );
    const connection = scopedConnection(
      database,
      context.identity.principal,
      policies,
    );
    const workOrder = await connection
      .repository<ServiceWorkOrderRow>('serviceWorkOrders')
      .findOne({ filter: { id: workOrderId } });
    if (!workOrder) throw notFound('The work order does not exist.');
  }

  return {
    async list(context, workOrderId) {
      await assertWorkOrderVisible(context, workOrderId);
      return system
        .repository<ServiceAttachmentRow>('serviceAttachments')
        .findMany({
          filter: (builder) => builder.number('workOrderId').eq(workOrderId),
          sort: (sort) => sort.field('createdAt').desc(),
        });
    },

    async create(context, input) {
      const ext = input.ext.replace(/^\./, '').toLowerCase();
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext as 'png' | 'docx')) {
        throw invalid('Only PNG photos and DOCX repair reports are accepted.');
      }
      if (!input.key || !input.filename) {
        throw invalid('The uploaded file is missing its stored location.');
      }
      await assertWorkOrderVisible(context, input.workOrderId);
      await authorizeComposite(context, 'service.workOrders', 'attach');
      const created = await system
        .repository<ServiceAttachmentRow>('serviceAttachments')
        .createOne({
          values: {
            // The primary key is a 36-character UUID with no database default, so the
            // application supplies it rather than relying on the dialect to generate one.
            id: randomUUID(),
            workOrderId: input.workOrderId,
            disk: input.disk,
            key: input.key,
            filename: input.filename,
            ext,
            mimeType: input.mimeType,
            size: input.size,
            createdAt: now(),
            updatedAt: now(),
          },
        });
      return created.record;
    },

    async remove(context, id) {
      const attachment = await system
        .repository<ServiceAttachmentRow>('serviceAttachments')
        .findOne({ filter: { id } });
      if (!attachment) throw notFound('The attachment does not exist.');
      if (attachment.workOrderId) {
        await assertWorkOrderVisible(context, attachment.workOrderId);
      }
      await authorizeComposite(context, 'service.workOrders', 'attach');
      await system
        .repository<ServiceAttachmentRow>('serviceAttachments')
        .deleteOne({ filter: { id } });
    },

    async get(context, id) {
      const attachment = await system
        .repository<ServiceAttachmentRow>('serviceAttachments')
        .findOne({ filter: { id } });
      if (!attachment) return undefined;
      if (attachment.workOrderId) {
        const policies = await authorizeComposite(
          context,
          'service.workOrders',
          'view',
        );
        const connection = scopedConnection(
          database,
          context.identity.principal,
          policies,
        );
        const workOrder = await connection
          .repository<ServiceWorkOrderRow>('serviceWorkOrders')
          .findOne({ filter: { id: attachment.workOrderId } });
        if (!workOrder) return undefined;
      }
      return attachment;
    },
  };
}
