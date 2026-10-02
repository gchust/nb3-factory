import { Bot, FileText, Home } from 'lucide-react';
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
    // The document library every signed-in user reads from. The page id is the
    // key the "资料主管/资料同事" permission sets grant, so renaming it would
    // orphan those grants; see database/main/seeds/202610010002_documents_seed.ts.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'materials' }, action: 'access' },
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: FileText },
    path: '/materials',
  },
  {
    // The read-only assistant. It shares the page-grant key with the seed too.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'assistant' }, action: 'access' },
    componentLoader: () => import('./pages/assistant/index.js'),
    name: 'assistant',
    navigation: { title: 'navigation.assistant', icon: Bot },
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
