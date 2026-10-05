import {
  Bell,
  BookOpen,
  Bot,
  CalendarCheck,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  MonitorCog,
  Plug,
  Users,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

// The after-sales collaboration pages, grouped under one menu entry. Every page
// declares the page id its permission set grants, so the sidebar and the server
// agree on who may open it.
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
    name: 'service',
    navigation: { title: 'navigation.service', icon: ClipboardList, order: 10 },
    children: [
      {
        name: 'service-dashboard',
        path: '/service',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-dashboard' },
          action: 'access',
        },
        navigation: { title: 'service.nav.dashboard', icon: LayoutDashboard },
        componentLoader: () => import('./pages/service/dashboard.js'),
      },
      {
        name: 'service-work-orders',
        path: '/service/work-orders',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-work-orders' },
          action: 'access',
        },
        navigation: { title: 'service.nav.workOrders', icon: ClipboardList },
        componentLoader: () => import('./pages/service/work-orders.js'),
      },
      {
        // The detail page shares the list's page id, so one grant covers both.
        name: 'service-work-order-detail',
        path: '/service/work-orders/:workOrderId',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-work-orders' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/work-order-detail.js'),
      },
      {
        name: 'service-equipment',
        path: '/service/equipment',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-equipment' },
          action: 'access',
        },
        navigation: { title: 'service.nav.equipment', icon: MonitorCog },
        componentLoader: () => import('./pages/service/equipment.js'),
      },
      {
        name: 'service-customers',
        path: '/service/customers',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-customers' },
          action: 'access',
        },
        navigation: { title: 'service.nav.customers', icon: Users },
        componentLoader: () => import('./pages/service/customers.js'),
      },
      {
        name: 'service-inspections',
        path: '/service/inspections',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-inspections' },
          action: 'access',
        },
        navigation: { title: 'service.nav.inspections', icon: CalendarCheck },
        componentLoader: () => import('./pages/service/inspections.js'),
      },
      {
        name: 'service-knowledge',
        path: '/service/knowledge',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-knowledge' },
          action: 'access',
        },
        navigation: { title: 'service.nav.knowledge', icon: BookOpen },
        componentLoader: () => import('./pages/service/knowledge.js'),
      },
      {
        name: 'service-manuals',
        path: '/service/manuals',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-manuals' },
          action: 'access',
        },
        navigation: { title: 'service.nav.manuals', icon: FileText },
        componentLoader: () => import('./pages/service/manuals.js'),
      },
      {
        name: 'service-assistant',
        path: '/service/assistant',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-assistant' },
          action: 'access',
        },
        navigation: { title: 'service.nav.assistant', icon: Bot },
        componentLoader: () => import('./pages/service/assistant.js'),
      },
      {
        name: 'service-messages',
        path: '/service/messages',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-messages' },
          action: 'access',
        },
        navigation: { title: 'service.nav.messages', icon: Bell },
        componentLoader: () => import('./pages/service/messages.js'),
      },
      {
        name: 'service-integration',
        path: '/service/integration',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service-integration' },
          action: 'access',
        },
        navigation: { title: 'service.nav.integration', icon: Plug },
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
