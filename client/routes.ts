import {
  Bell,
  BookMarked,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  HardDrive,
  Home,
  LayoutDashboard,
  Plug,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

import { SERVICE_PAGE_IDS } from './service/api.js';

const workOrderPage = {
  auth: 'required',
  authz: {
    resource: { type: 'page', id: SERVICE_PAGE_IDS.workOrders },
    action: 'access',
  },
} as const;

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
    auth: 'required',
    authz: {
      resource: { type: 'page', id: SERVICE_PAGE_IDS.dashboard },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/dashboard.js'),
    name: 'service-dashboard',
    navigation: { title: 'service.nav.dashboard', icon: LayoutDashboard },
    path: '/service/dashboard',
  },
  {
    ...workOrderPage,
    breadcrumb: { title: 'service.workOrders.title' },
    componentLoader: () => import('./pages/service/work-orders/index.js'),
    name: 'service-work-orders',
    navigation: { title: 'service.nav.workOrders', icon: ClipboardList },
    path: '/service/work-orders',
    children: [
      {
        ...workOrderPage,
        // The child path is relative to the parent (/service/work-orders), so a
        // leading `/service/work-orders/` here would double the segment.
        path: ':id',
        breadcrumb: { title: 'service.workOrders.detailTitle' },
        componentLoader: () => import('./pages/service/work-orders/detail.js'),
        name: 'service-work-order-detail',
      },
    ],
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: SERVICE_PAGE_IDS.inspections },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/inspections.js'),
    name: 'service-inspections',
    navigation: { title: 'service.nav.inspections', icon: CalendarCheck },
    path: '/service/inspections',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: SERVICE_PAGE_IDS.customers },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/customers.js'),
    name: 'service-customers',
    navigation: { title: 'service.nav.customers', icon: Users },
    path: '/service/customers',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: SERVICE_PAGE_IDS.devices },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/devices.js'),
    name: 'service-devices',
    navigation: { title: 'service.nav.devices', icon: HardDrive },
    path: '/service/devices',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: SERVICE_PAGE_IDS.knowledge },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/knowledge.js'),
    name: 'service-knowledge',
    navigation: { title: 'service.nav.knowledge', icon: BookOpen },
    path: '/service/knowledge',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: SERVICE_PAGE_IDS.manuals },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/manuals.js'),
    name: 'service-manuals',
    navigation: { title: 'service.nav.manuals', icon: BookMarked },
    path: '/service/manuals',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: SERVICE_PAGE_IDS.assistant },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/assistant.js'),
    name: 'service-assistant',
    navigation: { title: 'service.nav.assistant', icon: Sparkles },
    path: '/service/assistant',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: SERVICE_PAGE_IDS.integration },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/integration.js'),
    name: 'service-integration',
    navigation: { title: 'service.nav.integration', icon: Plug },
    path: '/service/integration',
  },
  {
    // The personal in-app inbox. It belongs to whoever is signed in, so it needs
    // no page grant of its own; the endpoint behind it still scopes to the actor.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/service/messages.js'),
    name: 'service-messages',
    navigation: { title: 'service.nav.messages', icon: Bell },
    path: '/service/messages',
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
