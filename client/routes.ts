import { FileText, Home, MessageSquareText } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

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
    // Both new pages declare their own `authz` rather than leaning on a default: the page id is what the seeded
    // page grant references, so the documents and assistant pages stay grantable and narrowable from the
    // authorization workspace. `home` above is the only page that opts out.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'documents' }, action: 'access' },
    componentLoader: () => import('./pages/documents/index.js'),
    name: 'documents',
    navigation: { title: 'navigation.documents', icon: FileText },
    path: '/documents',
    children: [
      {
        // The record page is a child so its path is addressable and it covers the list, and the
        // assistant can link a cited document straight to it. It inherits `documents`'s access check.
        // The path is relative to the parent: a child's path is appended to the parent's, so
        // `:id` resolves to `/documents/:id`. Writing `/documents/:id` here would register
        // `/documents/documents/:id` and leave `/documents/:id` to the wildcard redirect.
        auth: 'required',
        componentLoader: () => import('./pages/documents/detail.js'),
        name: 'document-detail',
        path: ':id',
      },
    ],
  },
  {
    auth: 'required',
    authz: { resource: { type: 'page', id: 'assistant' }, action: 'access' },
    componentLoader: () => import('./pages/assistant/index.js'),
    name: 'assistant',
    navigation: { title: 'navigation.assistant', icon: MessageSquareText },
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
