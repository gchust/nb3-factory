import { Home, Wrench } from 'lucide-react';
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
    // Navigation group for the equipment after-sales service desk. A group carries no path and no `authz`; each
    // page inside it declares its own page permission id, which is also what the service permission sets grant.
    name: 'service',
    navigation: { title: 'service.nav.group', icon: Wrench },
    children: [
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.dashboard' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/index.js'),
        name: 'service-dashboard',
        navigation: { title: 'service.nav.dashboard' },
        path: '/service',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.customers' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/customers.js'),
        name: 'service-customers',
        navigation: { title: 'service.nav.customers' },
        path: '/service/customers',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.equipment' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/equipment.js'),
        name: 'service-equipment',
        navigation: { title: 'service.nav.equipment' },
        path: '/service/equipment',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.workOrders' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/work-orders/index.js'),
        name: 'service-work-orders',
        navigation: { title: 'service.nav.workOrders' },
        path: '/service/work-orders',
      },
      {
        // The list navigates to this URL with the record id. It is a sibling route, not a child of the list, so the
        // list does not have to render an Outlet. Its own page permission is granted with the other service pages;
        // record-level access to one work order is enforced by the server, not by the page grant.
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.workOrderDetail' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/work-orders/detail.js'),
        name: 'service-work-order-detail',
        path: '/service/work-orders/:id',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.inspections' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/inspections.js'),
        name: 'service-inspections',
        navigation: { title: 'service.nav.inspections' },
        path: '/service/inspections',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.knowledge' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/knowledge.js'),
        name: 'service-knowledge',
        navigation: { title: 'service.nav.knowledge' },
        path: '/service/knowledge',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.manuals' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/manuals.js'),
        name: 'service-manuals',
        navigation: { title: 'service.nav.manuals' },
        path: '/service/manuals',
      },
      {
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'service.notifications' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service/notifications.js'),
        name: 'service-notifications',
        navigation: { title: 'service.nav.notifications' },
        path: '/service/notifications',
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
