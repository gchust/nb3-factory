import { Bot, BookOpenText, Home } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

import {
  KNOWLEDGE_ASSISTANT_PAGE,
  KNOWLEDGE_MATERIALS_PAGE,
} from './knowledge.js';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    // Both pages declare their `authz` explicitly against the stored page grant. The child declares the same page id
    // as its parent on purpose: it is the same surface, and a person granted the list is granted what the list opens.
    auth: 'required',
    authz: {
      resource: { type: 'page', id: KNOWLEDGE_MATERIALS_PAGE },
      action: 'access',
    },
    breadcrumb: { title: 'navigation.knowledgeMaterials' },
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'knowledge-materials',
    navigation: { title: 'navigation.knowledgeMaterials', icon: BookOpenText },
    path: '/materials',
    children: [
      {
        authz: {
          resource: { type: 'page', id: KNOWLEDGE_MATERIALS_PAGE },
          action: 'access',
        },
        breadcrumb: { title: 'knowledge.materials.detail.breadcrumb' },
        componentLoader: () => import('./pages/materials/detail.js'),
        name: 'knowledge-material-detail',
        path: ':materialId',
      },
    ],
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: KNOWLEDGE_ASSISTANT_PAGE },
      action: 'access',
    },
    breadcrumb: { title: 'navigation.knowledgeAssistant' },
    componentLoader: () => import('./pages/assistant/index.js'),
    name: 'knowledge-assistant',
    navigation: { title: 'navigation.knowledgeAssistant', icon: Bot },
    path: '/assistant',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
