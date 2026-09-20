import {
  Building2,
  ClipboardList,
  Coins,
  FileStack,
  Home,
  Package,
  Wrench,
} from 'lucide-react';
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
    // The repair workbench: requesters, dispatchers, technicians, supervisors and finance all land here,
    // and each of them sees only the tickets their role may read.
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.tickets' },
    componentLoader: () => import('./pages/tickets/index.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: ClipboardList },
    path: '/tickets',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.ticketNew' },
    componentLoader: () => import('./pages/tickets/new.js'),
    name: 'ticket-new',
    path: '/tickets/new',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.ticketDetail' },
    componentLoader: () => import('./pages/tickets/detail.js'),
    name: 'ticket-detail',
    path: '/tickets/:id',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.equipment' },
    componentLoader: () => import('./pages/equipment/index.js'),
    name: 'equipment',
    navigation: { title: 'navigation.equipment', icon: Wrench },
    path: '/equipment',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.equipmentDetail' },
    componentLoader: () => import('./pages/equipment/detail.js'),
    name: 'equipment-detail',
    path: '/equipment/:id',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.buildings' },
    componentLoader: () => import('./pages/assets/index.js'),
    name: 'buildings',
    // Not `/assets`: that prefix belongs to the built client's static files and is not routed to the SPA.
    navigation: { title: 'navigation.buildings', icon: Building2 },
    path: '/buildings',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.materials' },
    componentLoader: () => import('./pages/materials/index.js'),
    name: 'materials',
    navigation: { title: 'navigation.materials', icon: Package },
    path: '/materials',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.settlements' },
    componentLoader: () => import('./pages/settlements/index.js'),
    name: 'settlements',
    navigation: { title: 'navigation.settlements', icon: Coins },
    path: '/settlements',
  },
  {
    authz: 'skip',
    auth: 'required',
    breadcrumb: { title: 'navigation.files' },
    componentLoader: () => import('./pages/files/index.js'),
    name: 'files',
    navigation: { title: 'navigation.files', icon: FileStack },
    path: '/files',
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
