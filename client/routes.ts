import { BookOpen, Home, MessageSquareText } from 'lucide-react';
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
    // The materials the signed-in reader may open. The page id is the grant the
    // materials permission sets carry, so only a reader or a supervisor sees it.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'materials' }, action: 'access' },
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: BookOpen },
    path: '/materials',
  },
  {
    // The read-only question surface. It answers from the same page's materials,
    // authorized under the same identity, so it can never reveal more than the
    // reader can open here.
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
