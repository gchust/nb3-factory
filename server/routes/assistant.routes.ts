import { Hono, type Context } from 'hono';
import type { AuthorizationContext } from '@nocobase/authorization/core';

import {
  currentUserId,
  jsonError,
  parseJsonBody,
  toNumber,
  toText,
  type ServiceEnv,
  type ServiceRouteDeps,
} from './support.js';

type Ctx = Context<ServiceEnv>;

/**
 * The service assistant surface.
 *
 * It is gated by the assistant page grant and by nothing else it does not need:
 * the evidence it returns is already filtered by the caller's order `view` and
 * knowledge `read` scopes, so an inactive page grant is the only thing that
 * keeps a signed-in user out. The conversation is per-user, so a caller can
 * only ever read their own history.
 */
export function createAssistantRouter(deps: ServiceRouteDeps): Hono<ServiceEnv> {
  const router = new Hono<ServiceEnv>();

  async function canUseAssistant(context: Ctx): Promise<boolean> {
    const authz = context.get('authz') as AuthorizationContext;
    return authz.can({
      resource: { type: 'page', id: 'service.assistant' },
      action: 'access',
    });
  }

  router.use('/assistant/*', async (context, next) => {
    if (!(await canUseAssistant(context))) {
      return jsonError(context, 403, 'FORBIDDEN', '无权使用服务助手。');
    }
    await next();
  });

  router.get('/assistant/status', async (context) =>
    context.json({ data: await deps.assistant.status() }),
  );

  router.get('/assistant/messages', async (context) => {
    const orderId = toNumber(context.req.query('orderId'));
    return context.json({
      data: await deps.assistant.history(currentUserId(context), orderId),
    });
  });

  router.post('/assistant/ask', async (context) => {
    const body = await parseJsonBody(context);
    const question = (toText(body.question) ?? '').trim();
    if (question === '' || question.length > 2000) {
      return jsonError(
        context,
        422,
        'INVALID_QUESTION',
        '请输入 1 到 2000 字的问题。',
      );
    }
    const orderId = toNumber(body.orderId);
    const reply = await deps.assistant.ask(
      context.get('authz') as AuthorizationContext,
      currentUserId(context),
      orderId === undefined ? { question } : { question, orderId },
    );
    return context.json({ data: reply }, 201);
  });

  return router;
}
