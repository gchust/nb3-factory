import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Users,
  Wrench,
  Bot,
  BellRing,
  Library,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // The landing page every signed-in user reaches. It summarizes only the
    // rows the viewer is allowed to see, so it stays reachable without a page
    // grant: `authz: 'skip'` keeps a permission change from stranding a user.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/service/dashboard.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: LayoutDashboard },
    path: '/',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service.orders' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/orders/index.js'),
    name: 'service-orders',
    navigation: { title: 'navigation.serviceOrders', icon: ClipboardList },
    path: '/service/orders',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service.orders.detail' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/orders/detail.js'),
    name: 'service-order-detail',
    path: '/service/orders/:id',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service.ledger' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/ledger/index.js'),
    name: 'service-ledger',
    navigation: { title: 'navigation.serviceLedger', icon: Users },
    path: '/service/ledger',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service.knowledge' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/knowledge/index.js'),
    name: 'service-knowledge',
    navigation: { title: 'navigation.serviceKnowledge', icon: BookOpen },
    path: '/service/knowledge',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service.inspections' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/inspections/index.js'),
    name: 'service-inspections',
    navigation: { title: 'navigation.serviceInspections', icon: Wrench },
    path: '/service/inspections',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service.assistant' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/assistant/index.js'),
    name: 'service-assistant',
    navigation: { title: 'navigation.serviceAssistant', icon: Bot },
    path: '/service/assistant',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service.manuals' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/manuals/index.js'),
    name: 'service-manuals',
    navigation: { title: 'navigation.serviceManuals', icon: Library },
    path: '/service/manuals',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service.messages' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/messages/index.js'),
    name: 'service-messages',
    navigation: { title: 'navigation.serviceMessages', icon: BellRing },
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
