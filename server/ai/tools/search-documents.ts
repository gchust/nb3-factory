import { defineTools } from '@nocobase/ai-employee';
import {
  documentsServiceToken,
  type DocumentPrincipal,
} from '../../providers/documents.js';

/**
 * Read-only document search for the 资料助手 employee.
 *
 * The tool only ever asks the document service for records the *asker* may
 * read, so a regular colleague's run can never receive the content of a
 * `supervisor` document. It writes nothing: the assistant has no tool that can
 * create, update or delete a document, start a task, send a message, upload a
 * file or search the web.
 */
export const searchDocuments = defineTools({
  scope: 'GENERAL',
  // Never pauses the run: the assistant is fully automated and read-only.
  defaultPermission: 'ALLOW',
  execution: 'backend',
  i18n: { namespace: 'app' },
  introduction: {
    title: 'Search internal documents',
    about: 'Search the internal documents the current user is allowed to read.',
  },
  definition: {
    name: 'search-documents',
    description:
      'Search the internal documents the current user is allowed to read. Returns the matching documents with their id, title, content and a link for citing and opening them. Use this whenever the user asks a question that may be answered from the internal documents, and answer only from what it returns.',
    schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A keyword or phrase to look for, for example 报修电话 or 巡检间隔. Leave empty to list every document the user may read.',
        },
      },
      required: [],
    },
  },
  dependencies: { documents: documentsServiceToken },
  async invoke(ctx, args) {
    const principal: DocumentPrincipal = {
      // The actor comes from the authenticated session, never from the request.
      userId: String(ctx.actor.id),
      isRoot: Boolean(ctx.actor.isRoot),
    };
    const query = readQuery(args);
    const matches = await ctx.deps.documents.search(principal, query);
    const readable = await ctx.deps.documents.list(principal);
    return {
      query,
      totalReadableDocuments: readable.documents.length,
      canManage: readable.canManage,
      documents: matches.map((document) => ({
        id: document.id,
        title: document.title,
        content: document.content,
        link: document.link,
        accessLevel: document.accessLevel,
      })),
    };
  },
});

export default searchDocuments;

/** Reads the optional `query` argument without trusting the model's shape. */
function readQuery(args: unknown): string {
  if (args === null || typeof args !== 'object') {
    return '';
  }
  const value = (args as Record<string, unknown>).query;
  return typeof value === 'string' ? value : '';
}
