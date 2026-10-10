import {
  Bell,
  BookOpen,
  BookText,
  Bot,
  Building2,
  ClipboardCheck,
  ClipboardList,
  HardDrive,
  Home,
  KeyRound,
  LayoutDashboard,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteComponentLoader,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/**
 * The one module that serves both order-detail routes.
 *
 * A record's drawer is declared under every page the user may open it from — the
 * order list and the dashboard — so the record opened over the dashboard belongs
 * to the dashboard, and closing it returns there instead of to another page.
 */
const orderDetail: AppClientRouteComponentLoader = () =>
  import('./pages/orders/detail/index.js');

/** Create and edit of one record share a module; the id in the URL decides the mode. */
const customerForm: AppClientRouteComponentLoader = () =>
  import('./pages/customers/form.js');
const deviceForm: AppClientRouteComponentLoader = () =>
  import('./pages/devices/form.js');
const knowledgeForm: AppClientRouteComponentLoader = () =>
  import('./pages/knowledge/form.js');
/** A published entry's body, readable without the manage grant the form needs. */
const knowledgeDetail: AppClientRouteComponentLoader = () =>
  import('./pages/knowledge/detail.js');

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
    // The message center is every signed-in user's own inbox; the server scopes
    // it per user, so it needs no page grant and `authz: 'skip'` keeps it out of
    // page authorization entirely.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/messages/index.js'),
    name: 'messages',
    navigation: { title: 'shell.messageCenter', icon: Bell },
    path: '/messages',
  },
  {
    // The after-sales service pages, gathered under one menu group. The group itself owns no page, so its
    // children carry full paths rather than paths relative to a prefix.
    name: 'service',
    navigation: { title: 'service.navigation.title', icon: ClipboardList },
    children: [
      {
        name: 'service-dashboard',
        path: '/dashboard',
        auth: 'required',
        // The page id is a stored page grant, so it is deliberately stable.
        authz: {
          resource: { type: 'page', id: 'service.dashboard' },
          action: 'access',
        },
        navigation: {
          title: 'service.navigation.dashboard',
          icon: LayoutDashboard,
        },
        componentLoader: () => import('./pages/dashboard/index.js'),
        children: [
          // A record opens over the page the user is on, so the dashboard declares its own order drawer.
          {
            name: 'service-dashboard-order',
            path: ':orderId',
            componentLoader: orderDetail,
          },
        ],
      },
      {
        name: 'service-orders',
        path: '/orders',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.orders' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.orders' },
        componentLoader: () => import('./pages/orders/index.js'),
        children: [
          {
            name: 'service-order-new',
            path: 'new',
            componentLoader: () => import('./pages/orders/create.js'),
          },
          {
            name: 'service-order-detail',
            path: ':orderId',
            componentLoader: orderDetail,
          },
        ],
      },
      {
        name: 'service-customers',
        path: '/customers',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.customers' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.customers', icon: Building2 },
        componentLoader: () => import('./pages/customers/index.js'),
        children: [
          {
            name: 'service-customer-new',
            path: 'new',
            componentLoader: customerForm,
          },
          {
            name: 'service-customer-edit',
            path: ':customerId',
            componentLoader: customerForm,
          },
        ],
      },
      {
        name: 'service-devices',
        path: '/devices',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.devices' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.devices', icon: HardDrive },
        componentLoader: () => import('./pages/devices/index.js'),
        children: [
          {
            name: 'service-device-new',
            path: 'new',
            componentLoader: deviceForm,
          },
          {
            name: 'service-device-edit',
            path: ':deviceId',
            componentLoader: deviceForm,
          },
        ],
      },
      {
        name: 'service-knowledge',
        path: '/knowledge',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.knowledge' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.knowledge', icon: BookOpen },
        componentLoader: () => import('./pages/knowledge/index.js'),
        children: [
          {
            name: 'service-knowledge-new',
            path: 'new',
            componentLoader: knowledgeForm,
          },
          {
            name: 'service-knowledge-detail',
            path: ':knowledgeId/view',
            componentLoader: knowledgeDetail,
          },
          {
            name: 'service-knowledge-edit',
            path: ':knowledgeId',
            componentLoader: knowledgeForm,
          },
        ],
      },
      {
        name: 'service-inspections',
        path: '/inspections',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.inspections' },
          action: 'access',
        },
        navigation: {
          title: 'service.navigation.inspections',
          icon: ClipboardCheck,
        },
        componentLoader: () => import('./pages/inspections/index.js'),
        children: [
          {
            name: 'service-inspection-new',
            path: 'new',
            componentLoader: () => import('./pages/inspections/create.js'),
          },
          {
            name: 'service-inspection-complete',
            path: ':inspectionId',
            componentLoader: () => import('./pages/inspections/complete.js'),
          },
        ],
      },
      {
        name: 'service-manuals',
        path: '/manuals',
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.manuals' },
          action: 'access',
        },
        navigation: { title: 'service.navigation.manuals', icon: BookText },
        componentLoader: () => import('./pages/manuals/index.js'),
        children: [
          {
            name: 'service-manual-new',
            path: 'new',
            componentLoader: () => import('./pages/manuals/form.js'),
          },
        ],
      },
      {
        name: 'service-assistant',
        path: '/assistant',
        auth: 'required',
        // The page is a read-only diagnostic: it shows the registration state the server reports and grants no
        // business action of its own, so it needs no page grant and no permission set has to be edited to add one.
        authz: 'skip',
        navigation: { title: 'service.navigation.assistant', icon: Bot },
        componentLoader: () => import('./pages/assistant/index.js'),
      },
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'service-integration-keys',
    path: 'integration-keys',
    // A supervisor capability: the page issues and revokes the machine
    // account's API keys, and the server enforces the same composite action.
    authz: {
      resource: { type: 'page', id: 'service.integrationKeys' },
      action: 'access',
    },
    navigation: {
      title: 'service.integrationKeys.title',
      icon: KeyRound,
    },
    componentLoader: () => import('./pages/integration-keys/index.js'),
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
