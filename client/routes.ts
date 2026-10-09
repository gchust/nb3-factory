import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HardDrive,
  Home,
  Users,
  Wrench,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/** Page id shared with `server/service-authorization.ts` → `SERVICE_PAGES`. */
const page = (id: string) => ({
  resource: { type: 'page', id: `service.${id}` },
  action: 'access',
});

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
    // The service group owns its navigation section. It deliberately declares no
    // `path`: an app route resolver prepends a group's path to every child's, so a
    // group path of `/service` plus absolute children (`/service/tickets`) would
    // register `/service/service/tickets` and the record page twice over. The
    // children below therefore carry the full path and the group inherits `/`.
    name: 'service',
    auth: 'required',
    navigation: { title: 'navigation.service', icon: Wrench, order: 10 },
    children: [
      {
        name: 'service-dashboard',
        path: '/service',
        auth: 'required',
        authz: page('dashboard'),
        componentLoader: () => import('./pages/service/dashboard.js'),
        navigation: { title: 'navigation.serviceDashboard', icon: Activity },
      },
      {
        name: 'service-customers',
        path: '/service/customers',
        auth: 'required',
        authz: page('customers'),
        componentLoader: () => import('./pages/service/customers.js'),
        navigation: { title: 'navigation.serviceCustomers', icon: Users },
      },
      {
        name: 'service-devices',
        path: '/service/devices',
        auth: 'required',
        authz: page('devices'),
        componentLoader: () => import('./pages/service/devices.js'),
        navigation: { title: 'navigation.serviceDevices', icon: HardDrive },
      },
      {
        name: 'service-tickets',
        path: '/service/tickets',
        auth: 'required',
        authz: page('tickets'),
        componentLoader: () => import('./pages/service/tickets/index.js'),
        navigation: {
          title: 'navigation.serviceTickets',
          icon: ClipboardList,
        },
        children: [
          {
            // Relative to the parent page (`/service/tickets`), as a child route
            // under a page must be: an absolute `/service/tickets/:ticketId` would
            // be appended to the parent path and register `/service/tickets/service/tickets/:ticketId`.
            name: 'service-ticket-detail',
            path: ':ticketId',
            auth: 'required',
            breadcrumb: { title: 'service.tickets.detail' },
            componentLoader: () => import('./pages/service/tickets/detail.js'),
          },
        ],
      },
      {
        name: 'service-inspections',
        path: '/service/inspections',
        auth: 'required',
        authz: page('inspections'),
        componentLoader: () => import('./pages/service/inspections.js'),
        navigation: {
          title: 'navigation.serviceInspections',
          icon: ClipboardCheck,
        },
      },
      {
        name: 'service-knowledge',
        path: '/service/knowledge',
        auth: 'required',
        authz: page('knowledge'),
        componentLoader: () => import('./pages/service/knowledge.js'),
        navigation: { title: 'navigation.serviceKnowledge', icon: BookOpen },
      },
      {
        name: 'service-manuals',
        path: '/service/manuals',
        auth: 'required',
        authz: page('manuals'),
        componentLoader: () => import('./pages/service/manuals.js'),
        navigation: { title: 'navigation.serviceManuals', icon: FileText },
      },
      {
        name: 'service-assistant',
        path: '/service/assistant',
        auth: 'required',
        authz: page('assistant'),
        componentLoader: () => import('./pages/service/assistant.js'),
        navigation: { title: 'navigation.serviceAssistant', icon: Bot },
      },
      {
        name: 'service-messages',
        path: '/service/messages',
        auth: 'required',
        authz: page('messages'),
        componentLoader: () => import('./pages/service/messages.js'),
        navigation: { title: 'navigation.serviceMessages', icon: Bell },
      },
      {
        name: 'service-operations',
        path: '/service/operations',
        auth: 'required',
        authz: page('operations'),
        componentLoader: () => import('./pages/service/operations.js'),
        navigation: { title: 'navigation.serviceOperations', icon: Wrench },
      },
    ],
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
