import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serviceAssistantServiceToken } from '../providers/tokens.js';
import type { ServiceAssistantService } from '../providers/assistant-service.js';
import {
  authorizeAction,
  jsonBody,
  queryValue,
  type ServiceEnv,
} from './service-shared.js';

/**
 * The after-sales assistant. It runs a real keyword search over the published
 * knowledge base and manuals. A generated answer is only returned when a
 * language model is configured; otherwise the response is explicitly
 * `{ ai: { status: 'blocked', reason } }` beside the real search hits, never an
 * invented reply.
 */
export function createAssistantRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const assistant: ServiceAssistantService = app.container.resolve(
    serviceAssistantServiceToken,
  );
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  routes.get('/search', async (context) => {
    await authorizeAction(context, 'service.knowledge', 'view');
    await authorizeAction(context, 'service.manuals', 'view');
    const term = queryValue(context, 'query') ?? queryValue(context, 'q') ?? '';
    if (term.trim().length === 0) return context.json({ data: [] });
    const data = await assistant.search(term);
    return context.json({ data });
  });

  routes.post('/ask', async (context) => {
    await authorizeAction(context, 'service.knowledge', 'view');
    const body = await jsonBody(context);
    const question = body.question;
    if (typeof question !== 'string' || question.trim().length === 0) {
      throw new HTTPException(400, { message: 'question is required' });
    }
    if (question.length > 2000) {
      throw new HTTPException(400, { message: 'question is too long' });
    }
    const answer = await assistant.ask(question);
    return context.json({ data: answer });
  });

  return routes;
}
