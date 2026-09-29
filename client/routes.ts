import {
  Bell,
  BookOpen,
  Cpu,
  ClipboardCheck,
  Home,
  LayoutDashboard,
  Sparkles,
  TicketCheck,
  Users,
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
    // A navigation group: no component, no path, no authz of its own.
    name: 'service',
    navigation: { title: 'navigation.service', icon: Wrench },
    children: [
      {
        name: 'service-dashboard',
        path: '/service/dashboard',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.dashboard' },
          action: 'access',
        },
        navigation: {
          title: 'navigation.serviceDashboard',
          icon: LayoutDashboard,
        },
        componentLoader: () => import('./pages/service/dashboard/index.js'),
      },
      {
        name: 'service-tickets',
        path: '/service/tickets',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.tickets' },
          action: 'access',
        },
        navigation: { title: 'navigation.serviceTickets', icon: TicketCheck },
        componentLoader: () => import('./pages/service/tickets/index.js'),
        children: [
          {
            // A record detail: no menu entry. It inherits the list page's page check.
            name: 'service-ticket-detail',
            path: ':ticketId',
            authz: 'skip',
            componentLoader: () => import('./pages/service/tickets/detail.js'),
          },
        ],
      },
      {
        name: 'service-customers',
        path: '/service/customers',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.customers' },
          action: 'access',
        },
        navigation: { title: 'navigation.serviceCustomers', icon: Users },
        componentLoader: () => import('./pages/service/customers/index.js'),
      },
      {
        name: 'service-devices',
        path: '/service/devices',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.devices' },
          action: 'access',
        },
        navigation: { title: 'navigation.serviceDevices', icon: Cpu },
        componentLoader: () => import('./pages/service/devices/index.js'),
      },
      {
        name: 'service-inspections',
        path: '/service/inspections',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.inspections' },
          action: 'access',
        },
        navigation: {
          title: 'navigation.serviceInspections',
          icon: ClipboardCheck,
        },
        componentLoader: () => import('./pages/service/inspections/index.js'),
      },
      {
        name: 'service-knowledge',
        path: '/service/knowledge',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.knowledge' },
          action: 'access',
        },
        navigation: { title: 'navigation.serviceKnowledge', icon: BookOpen },
        componentLoader: () => import('./pages/service/knowledge/index.js'),
      },
      {
        name: 'service-assistant',
        path: '/service/assistant',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.assistant' },
          action: 'access',
        },
        navigation: { title: 'navigation.serviceAssistant', icon: Sparkles },
        componentLoader: () => import('./pages/service/assistant/index.js'),
      },
      {
        // The durable in-app inbox is per recipient: the server scopes every
        // message by the signed-in user, so page access needs no business role
        // beyond being signed in. The header bell links here.
        name: 'service-notifications',
        path: '/service/notifications',
        auth: 'required',
        authz: 'skip',
        navigation: {
          title: 'navigation.serviceNotifications',
          icon: Bell,
        },
        componentLoader: () => import('./pages/service/notifications/index.js'),
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
