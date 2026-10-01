import {
  BellIcon,
  BookOpenIcon,
  BotIcon,
  ClipboardListIcon,
  FileTextIcon,
  HardDriveIcon,
  LayoutDashboardIcon,
  StethoscopeIcon,
  UsersIcon,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

// The service-desk pages. Each first page declares the `page` resource it
// belongs to, so page access is an ordinary authorization grant an
// administrator can see and assign in Settings; the seeded service permission
// sets carry the matching grants. Data access is scoped again on the server.
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-dashboard' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/dashboard.js'),
    name: 'service-dashboard',
    navigation: { title: 'navigation.dashboard', icon: LayoutDashboardIcon },
    path: '/',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-customers' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/customers.js'),
    name: 'service-customers',
    navigation: { title: 'navigation.customers', icon: UsersIcon },
    path: '/customers',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-customers' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/customer-detail.js'),
    name: 'service-customer-detail',
    path: '/customers/:id',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-devices' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/devices.js'),
    name: 'service-devices',
    navigation: { title: 'navigation.devices', icon: HardDriveIcon },
    path: '/devices',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-work-orders' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/work-orders.js'),
    name: 'service-work-orders',
    navigation: { title: 'navigation.workOrders', icon: ClipboardListIcon },
    path: '/work-orders',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-work-orders' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/work-order-detail.js'),
    name: 'service-work-order-detail',
    path: '/work-orders/:id',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-inspections' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/inspections.js'),
    name: 'service-inspections',
    navigation: { title: 'navigation.inspections', icon: StethoscopeIcon },
    path: '/inspections',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-knowledge' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/knowledge.js'),
    name: 'service-knowledge',
    navigation: { title: 'navigation.knowledge', icon: BookOpenIcon },
    path: '/knowledge',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-manuals' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/manuals.js'),
    name: 'service-manuals',
    navigation: { title: 'navigation.manuals', icon: FileTextIcon },
    path: '/manuals',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-assistant' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/assistant.js'),
    name: 'service-assistant',
    navigation: { title: 'navigation.assistant', icon: BotIcon },
    path: '/assistant',
  },
  {
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'service-notifications' },
      action: 'access',
    },
    componentLoader: () => import('./pages/service/notifications.js'),
    name: 'service-notifications',
    navigation: { title: 'navigation.messages', icon: BellIcon },
    path: '/notifications',
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
