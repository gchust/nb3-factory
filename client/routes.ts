import {
  BookOpen,
  Bot,
  CalendarCheck,
  ClipboardList,
  FileText,
  HardDrive,
  Home,
  LayoutDashboard,
  MessagesSquare,
  ServerCog,
  Users,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/**
 * The after-sales service surface.
 *
 * Pages are grouped into three navigation sections — dispatch, knowledge and
 * system — and every product page carries its own `authz` rule so the menu and
 * the loader read the same grant the server enforces.
 */
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
    name: 'service-dispatch',
    navigation: {
      title: 'navigation.serviceDispatch',
      icon: ClipboardList,
      order: 10,
    },
    children: [
      {
        name: 'dashboard',
        path: '/dashboard',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'service.overview' }, action: 'access' },
        navigation: { title: 'navigation.dashboard', icon: LayoutDashboard },
        componentLoader: () => import('./pages/dashboard.js'),
      },
      {
        name: 'customers',
        path: '/customers',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'service.customers' }, action: 'access' },
        navigation: { title: 'navigation.customers', icon: Users },
        componentLoader: () => import('./pages/customers.js'),
      },
      {
        name: 'devices',
        path: '/devices',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'service.devices' }, action: 'access' },
        navigation: { title: 'navigation.devices', icon: HardDrive },
        componentLoader: () => import('./pages/devices.js'),
      },
      {
        name: 'work-orders',
        path: '/workOrders',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'service.workOrders' }, action: 'access' },
        navigation: { title: 'navigation.workOrders', icon: ClipboardList },
        componentLoader: () => import('./pages/work-orders/index.js'),
        children: [
          {
            // The record's detail is a URL of its own, so it can be opened and
            // refreshed directly. It inherits the list page's authorization.
            name: 'work-order-detail',
            path: ':id',
            componentLoader: () => import('./pages/work-orders/detail.js'),
          },
        ],
      },
      {
        name: 'inspections',
        path: '/inspections',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'service.inspections' }, action: 'access' },
        navigation: { title: 'navigation.inspections', icon: CalendarCheck },
        componentLoader: () => import('./pages/inspections.js'),
      },
    ],
  },
  {
    name: 'service-knowledge',
    navigation: {
      title: 'navigation.serviceKnowledge',
      icon: BookOpen,
      order: 20,
    },
    children: [
      {
        name: 'knowledge',
        path: '/knowledge',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'service.repairNotes' }, action: 'access' },
        navigation: { title: 'navigation.knowledge', icon: BookOpen },
        componentLoader: () => import('./pages/knowledge.js'),
      },
      {
        name: 'manuals',
        path: '/manuals',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'service.manuals' }, action: 'access' },
        navigation: { title: 'navigation.manuals', icon: FileText },
        componentLoader: () => import('./pages/manuals.js'),
      },
    ],
  },
  {
    name: 'service-system',
    navigation: {
      title: 'navigation.serviceSystem',
      icon: ServerCog,
      order: 30,
    },
    children: [
      {
        name: 'operations',
        path: '/operations',
        auth: 'required',
        authz: { resource: { type: 'page', id: 'service.operations' }, action: 'access' },
        navigation: { title: 'navigation.operations', icon: ServerCog },
        componentLoader: () => import('./pages/operations.js'),
      },
      {
        // A personal inbox: every signed-in user has one, so there is no page grant to check.
        name: 'messages',
        path: '/messages',
        auth: 'required',
        authz: 'skip',
        navigation: { title: 'navigation.messages', icon: MessagesSquare },
        componentLoader: () => import('./pages/messages.js'),
      },
      {
        // The assistant reports its own readiness; nothing to gate a page on when it is off.
        name: 'assistant',
        path: '/assistant',
        auth: 'required',
        authz: 'skip',
        navigation: { title: 'navigation.assistant', icon: Bot },
        componentLoader: () => import('./pages/assistant.js'),
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
