import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { materialsServiceToken } from '../services/materials.js';
import { createMaterialsRoutes } from './materials.js';

const materialsApi = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  router.route(
    '/materials',
    createMaterialsRoutes(
      app.container.resolve(authenticationToken),
      app.container.resolve(authorizationToken),
      app.container.resolve(materialsServiceToken),
    ),
  );
  return router;
});

const routes: readonly AppRouteContribution<Application>[] = [materialsApi];

export default routes;
