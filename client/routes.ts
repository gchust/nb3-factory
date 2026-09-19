import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  Home,
  Users,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    // Menu group for the recruitment feature. The group itself carries no page
    // permission; each child page keeps its own `page:<name>/access` check.
    name: 'recruitment',
    navigation: { title: 'navigation.recruitment', icon: Briefcase },
    children: [
      {
        auth: 'required',
        componentLoader: () => import('./pages/recruitment/positions.js'),
        name: 'recruitment-positions',
        navigation: {
          title: 'navigation.recruitmentPositions',
          icon: Briefcase,
        },
        path: '/recruitment/positions',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/recruitment/candidates.js'),
        name: 'recruitment-candidates',
        navigation: { title: 'navigation.recruitmentCandidates', icon: Users },
        path: '/recruitment/candidates',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/recruitment/interviews.js'),
        name: 'recruitment-interviews',
        navigation: {
          title: 'navigation.recruitmentInterviews',
          icon: CalendarDays,
        },
        path: '/recruitment/interviews',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/recruitment/onboarding.js'),
        name: 'recruitment-onboarding',
        navigation: {
          title: 'navigation.recruitmentOnboarding',
          icon: ClipboardCheck,
        },
        path: '/recruitment/onboarding',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/recruitment/stats.js'),
        name: 'recruitment-stats',
        navigation: { title: 'navigation.recruitmentStats', icon: BarChart3 },
        path: '/recruitment/stats',
      },
    ],
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

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
