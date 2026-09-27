import {
  BookOpen,
  Building2,
  ClipboardCheck,
  HardDrive,
  Home,
  Inbox,
  LayoutDashboard,
  Plug,
  Sparkles,
  Ticket,
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
    // The after-sales service area. Each page declares its own `authz` page id,
    // so a permission set decides which of these a user may open; the server
    // endpoints behind them re-check the same permission independently.
    auth: 'required',
    name: 'service',
    path: '/service',
    navigation: { title: 'navigation.service', icon: LayoutDashboard },
    children: [
      {
        name: 'service-dashboard',
        path: 'dashboard',
        authz: {
          resource: { type: 'page', id: 'service.dashboard' },
          action: 'access',
        },
        navigation: {
          title: 'service.navigation.dashboard',
          icon: LayoutDashboard,
        },
        componentLoader: () => import('./pages/service/dashboard.js'),
      },
      {
        name: 'service-tickets',
        path: 'tickets',
        authz: {
          resource: { type: 'page', id: 'service.tickets' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.tickets', icon: Ticket },
        componentLoader: () => import('./pages/service/tickets.js'),
      },
      {
        name: 'service-ticket-detail',
        path: 'tickets/:ticketId',
        authz: {
          resource: { type: 'page', id: 'service.tickets.detail' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/ticket-detail.js'),
      },
      {
        name: 'service-customers',
        path: 'customers',
        authz: {
          resource: { type: 'page', id: 'service.customers' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.customers', icon: Building2 },
        componentLoader: () => import('./pages/service/customers.js'),
      },
      {
        name: 'service-customer-detail',
        path: 'customers/:customerId',
        authz: {
          resource: { type: 'page', id: 'service.customers.detail' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/customer-detail.js'),
      },
      {
        name: 'service-devices',
        path: 'devices',
        authz: {
          resource: { type: 'page', id: 'service.devices' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.devices', icon: HardDrive },
        componentLoader: () => import('./pages/service/devices.js'),
      },
      {
        name: 'service-device-detail',
        path: 'devices/:deviceId',
        authz: {
          resource: { type: 'page', id: 'service.devices.detail' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/device-detail.js'),
      },
      {
        name: 'service-knowledge',
        path: 'knowledge',
        authz: {
          resource: { type: 'page', id: 'service.knowledge' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.knowledge', icon: BookOpen },
        componentLoader: () => import('./pages/service/knowledge.js'),
      },
      {
        name: 'service-knowledge-detail',
        path: 'knowledge/:articleId',
        authz: {
          resource: { type: 'page', id: 'service.knowledge.detail' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/knowledge-detail.js'),
      },
      {
        name: 'service-inspections',
        path: 'inspections',
        authz: {
          resource: { type: 'page', id: 'service.inspections' },
          action: 'access',
        },
        navigation: {
          title: 'service.navigation.inspections',
          icon: ClipboardCheck,
        },
        componentLoader: () => import('./pages/service/inspections.js'),
      },
      {
        name: 'service-messages',
        path: 'messages',
        authz: {
          resource: { type: 'page', id: 'service.messages' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.messages', icon: Inbox },
        componentLoader: () => import('./pages/service/messages.js'),
      },
      {
        name: 'service-assistant',
        path: 'assistant',
        authz: {
          resource: { type: 'page', id: 'service.assistant' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.assistant', icon: Sparkles },
        componentLoader: () => import('./pages/service/assistant.js'),
      },
      {
        name: 'service-integration',
        path: 'integration',
        authz: {
          resource: { type: 'page', id: 'service.integration' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.integration', icon: Plug },
        componentLoader: () => import('./pages/service/integration.js'),
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
