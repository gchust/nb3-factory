import {
  Bot,
  BookOpen,
  ClipboardCheck,
  Cpu,
  Home,
  LayoutDashboard,
  Mail,
  Ticket,
  Users,
  UsersRound,
  Workflow,
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
    auth: 'guest',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
  {
    // The service module's navigation group. A group owns menu structure only; every destination
    // is a page route below it, and each page declares the authorization resource it needs.
    name: 'service',
    auth: 'required',
    navigation: { title: 'navigation.service.group', icon: Wrench },
    children: [
      {
        name: 'serviceDashboard',
        path: '/service',
        authz: {
          resource: { type: 'page', id: 'service.dashboard' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/dashboard.js'),
        navigation: {
          title: 'navigation.service.dashboard',
          icon: LayoutDashboard,
        },
      },
      {
        name: 'serviceTickets',
        path: '/service/tickets',
        authz: {
          resource: { type: 'page', id: 'service.tickets' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/tickets/index.js'),
        navigation: { title: 'navigation.service.tickets', icon: Ticket },
        children: [
          {
            name: 'serviceTicketDetail',
            path: ':id',
            componentLoader: () => import('./pages/service/tickets/detail.js'),
            breadcrumb: { title: 'navigation.service.ticketDetail' },
          },
        ],
      },
      {
        name: 'serviceCustomers',
        path: '/service/customers',
        authz: {
          resource: { type: 'page', id: 'service.customers' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/customers.js'),
        navigation: { title: 'navigation.service.customers', icon: Users },
      },
      {
        name: 'serviceDevices',
        path: '/service/devices',
        authz: {
          resource: { type: 'page', id: 'service.devices' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/devices.js'),
        navigation: { title: 'navigation.service.devices', icon: Cpu },
      },
      {
        name: 'serviceKnowledge',
        path: '/service/knowledge',
        authz: {
          resource: { type: 'page', id: 'service.knowledge' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/knowledge/index.js'),
        navigation: { title: 'navigation.service.knowledge', icon: BookOpen },
        children: [
          {
            name: 'serviceKnowledgeDetail',
            path: ':id',
            componentLoader: () =>
              import('./pages/service/knowledge/detail.js'),
            breadcrumb: { title: 'navigation.service.knowledgeDetail' },
          },
        ],
      },
      {
        name: 'serviceInspections',
        path: '/service/inspections',
        authz: {
          resource: { type: 'page', id: 'service.inspections' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/inspections.js'),
        navigation: {
          title: 'navigation.service.inspections',
          icon: ClipboardCheck,
        },
      },
      {
        name: 'serviceAutomation',
        path: '/service/automation',
        authz: {
          resource: { type: 'page', id: 'service.automation' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/automation.js'),
        navigation: {
          title: 'navigation.service.automation',
          icon: Workflow,
        },
      },
      {
        name: 'serviceAssistant',
        path: '/service/assistant',
        authz: {
          resource: { type: 'page', id: 'service.assistant' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/assistant.js'),
        navigation: { title: 'navigation.service.assistant', icon: Bot },
      },
      {
        // A personal inbox every signed-in user reaches; per-user API authentication is the
        // security boundary, so this page is deliberately outside page authorization.
        name: 'serviceMessages',
        path: '/service/messages',
        authz: 'skip',
        componentLoader: () => import('./pages/service/messages.js'),
        navigation: { title: 'navigation.service.messages', icon: Mail },
      },
      {
        name: 'serviceTeam',
        path: '/service/team',
        authz: {
          resource: { type: 'page', id: 'service.members' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/team.js'),
        navigation: { title: 'navigation.service.team', icon: UsersRound },
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
