import { FlaskConical, Home, Palette } from 'lucide-react';
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
    // Reachable by every signed-in user: a smoke page exists to prove the pipeline wired a page and a button, so it
    // asks for no page grant rather than making it disappear behind a permission nobody was meant to create.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/pipeline-smoke.js'),
    name: 'pipeline-smoke',
    navigation: { title: 'navigation.pipelineSmoke', icon: FlaskConical },
    path: '/pipeline-smoke',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    // A settings page carries no access rule on its own. Asking for a page grant keeps the application's own
    // appearance settings with the administrators who own the configuration, and lets them grant the page onward
    // instead of exposing it to every signed-in user. "order" keeps this preference page below the operational ones.
    authz: { resource: { type: 'page', id: 'theme' }, action: 'access' },
    componentLoader: () => import('./pages/settings/theme/index.js'),
    name: 'theme',
    navigation: {
      title: 'appearance.theme.title',
      icon: Palette,
      order: 100,
    },
    path: '/theme',
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
