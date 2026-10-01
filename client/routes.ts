import { BookOpenText, Home, MessageCircleQuestion } from 'lucide-react';
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
    // The material library and the assistant are open to every signed-in user. Access is decided per material on the
    // server, not per page: a colleague is answered from the public materials alone, so the page itself needs no
    // authorization rule and the user's permission set is what keeps a restricted material out of reach.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: BookOpenText },
    path: '/materials',
  },
  {
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/assistant/index.js'),
    name: 'assistant',
    navigation: { title: 'navigation.assistant', icon: MessageCircleQuestion },
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
