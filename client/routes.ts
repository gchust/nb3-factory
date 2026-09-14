import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import {
  Briefcase,
  CalendarClock,
  FileCheck2,
  Home,
  LayoutDashboard,
  Users,
} from 'lucide-react';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/dashboard.js'),
    name: 'dashboard',
    navigation: { title: 'navigation.dashboard', icon: LayoutDashboard },
    path: '/dashboard',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/requisitions.js'),
    name: 'requisitions',
    navigation: { title: 'navigation.requisitions', icon: Briefcase },
    path: '/requisitions',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/candidates.js'),
    name: 'candidates',
    navigation: { title: 'navigation.candidates', icon: Users },
    path: '/candidates',
  },
  {
    // A standalone detail page rather than a child of the candidate list: the list has no content area to host
    // an outlet, and the accepted interaction is a full-page detail with its own back link. It declares no
    // navigation and reuses the same candidate page grant through its own name.
    auth: 'required',
    componentLoader: () => import('./pages/candidate-detail.js'),
    name: 'candidateDetail',
    path: '/candidates/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/interviews.js'),
    name: 'interviews',
    navigation: { title: 'navigation.interviews', icon: CalendarClock },
    path: '/interviews',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/offers.js'),
    name: 'offers',
    navigation: { title: 'navigation.offers', icon: FileCheck2 },
    path: '/offers',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
