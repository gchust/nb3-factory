import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  HardDrive,
  Home,
  LayoutDashboard,
  Sparkles,
  Users,
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
    navigation: { title: 'navigation.home', icon: Home, order: -100 },
    path: '/',
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
  {
    // The 设备售后服务与巡检协同系统 module. The group has no page of its own;
    // the first child (`dashboard`) owns the shared page guard, and the rest
    // inherit it because they sit under the same ancestors.
    name: 'service',
    auth: 'required',
    navigation: { title: 'navigation.service', icon: HardDrive, order: 10 },
    children: [
      {
        name: 'service-dashboard',
        path: 'service/dashboard',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-dashboard' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/dashboard/index.js'),
        navigation: {
          title: 'navigation.serviceDashboard',
          icon: LayoutDashboard,
        },
      },
      {
        name: 'service-customers',
        path: 'service/customers',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-customers' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/customers/index.js'),
        navigation: { title: 'navigation.serviceCustomers', icon: Users },
      },
      {
        name: 'service-devices',
        path: 'service/devices',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-devices' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/devices/index.js'),
        navigation: { title: 'navigation.serviceDevices', icon: HardDrive },
      },
      {
        name: 'service-tickets',
        path: 'service/tickets',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-tickets' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/tickets/index.js'),
        navigation: { title: 'navigation.serviceTickets', icon: ClipboardList },
        children: [
          {
            // The ticket detail is a covering child page, so it is a route
            // rather than a dialog: it may be linked to, reloaded and shared.
            name: 'service-ticket-detail',
            path: ':ticketId',
            auth: 'required',
            breadcrumb: { title: 'navigation.serviceTicketDetail' },
            componentLoader: () =>
              import('./pages/service/tickets/detail/index.js'),
          },
        ],
      },
      {
        name: 'service-inspections',
        path: 'service/inspections',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-inspections' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/inspections/index.js'),
        navigation: {
          title: 'navigation.serviceInspections',
          icon: CalendarCheck,
        },
      },
      {
        name: 'service-knowledge',
        path: 'service/knowledge',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-knowledge' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/knowledge/index.js'),
        navigation: { title: 'navigation.serviceKnowledge', icon: BookOpen },
      },
      {
        name: 'service-assistant',
        path: 'service/assistant',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-assistant' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/assistant/index.js'),
        navigation: { title: 'navigation.serviceAssistant', icon: Sparkles },
      },
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
