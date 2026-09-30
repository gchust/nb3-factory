import { Home, Wrench } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

function page(id: string) {
  return { resource: { type: 'page', id }, action: 'access' } as const;
}

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
    // Menu group for the after-sales workspace. A group carries no component and no permission of its own; the
    // permission that decides whether a leaf shows belongs to the page itself.
    name: 'service',
    navigation: { title: 'navigation.service', icon: Wrench, order: 10 },
    children: [
      {
        name: 'service-dashboard',
        path: '/service',
        auth: 'required',
        authz: page('service.dashboard'),
        navigation: { title: 'navigation.serviceDashboard' },
        componentLoader: () => import('./pages/service/dashboard/index.js'),
      },
      {
        name: 'service-customers',
        path: '/service/customers',
        auth: 'required',
        authz: page('service.customers'),
        navigation: { title: 'navigation.serviceCustomers' },
        componentLoader: () => import('./pages/service/customers.js'),
      },
      {
        name: 'service-devices',
        path: '/service/devices',
        auth: 'required',
        authz: page('service.devices'),
        navigation: { title: 'navigation.serviceDevices' },
        componentLoader: () => import('./pages/service/devices.js'),
      },
      {
        name: 'service-tickets',
        path: '/service/tickets',
        auth: 'required',
        authz: page('service.tickets'),
        navigation: { title: 'navigation.serviceTickets' },
        componentLoader: () => import('./pages/service/tickets/index.js'),
        children: [
          {
            // Create form: focused, so a dialog. It renders on top of the list's own Outlet.
            name: 'service-ticket-new',
            path: 'new',
            authz: 'skip',
            componentLoader: () => import('./pages/service/tickets/new.js'),
          },
          {
            // Record detail is a destination that survives a reload, so it keeps the parent's check and
            // declares none of its own.
            name: 'service-ticket-detail',
            path: ':ticketId',
            authz: 'skip',
            componentLoader: () => import('./pages/service/tickets/detail.js'),
          },
        ],
      },
      {
        name: 'service-inspections',
        path: '/service/inspections',
        auth: 'required',
        authz: page('service.inspections'),
        navigation: { title: 'navigation.serviceInspections' },
        componentLoader: () => import('./pages/service/inspections/index.js'),
        children: [
          {
            name: 'service-inspection-new',
            path: 'new',
            authz: 'skip',
            componentLoader: () => import('./pages/service/inspections/new.js'),
          },
          {
            name: 'service-inspection-detail',
            path: ':inspectionId',
            authz: 'skip',
            componentLoader: () =>
              import('./pages/service/inspections/detail.js'),
          },
        ],
      },
      {
        name: 'service-knowledge',
        path: '/service/knowledge',
        auth: 'required',
        authz: page('service.knowledge'),
        navigation: { title: 'navigation.serviceKnowledge' },
        componentLoader: () => import('./pages/service/knowledge.js'),
      },
      {
        name: 'service-manuals',
        path: '/service/manuals',
        auth: 'required',
        authz: page('service.manuals'),
        navigation: { title: 'navigation.serviceManuals' },
        componentLoader: () => import('./pages/service/manuals.js'),
      },
      {
        // The message centre is reachable from the header bell for every
        // signed-in user, so it is deliberately outside page authorization and
        // declares no sidebar entry of its own.
        name: 'service-notifications',
        path: '/service/notifications',
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/service/notifications.js'),
      },
      {
        name: 'service-assistant',
        path: '/service/assistant',
        auth: 'required',
        authz: page('service.assistant'),
        navigation: { title: 'navigation.serviceAssistant' },
        componentLoader: () => import('./pages/service/assistant.js'),
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
