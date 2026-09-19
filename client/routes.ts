import {
  ClipboardCheck,
  ClipboardList,
  HardHat,
  Home,
  Wrench,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/equipment/index.js'),
    name: 'equipment',
    navigation: { title: 'navigation.equipment', icon: HardHat },
    breadcrumb: { title: 'navigation.equipment' },
    path: '/equipment',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/templates/index.js'),
    name: 'templates',
    navigation: { title: 'navigation.templates', icon: ClipboardList },
    breadcrumb: { title: 'navigation.templates' },
    path: '/templates',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/inspections/index.js'),
    name: 'inspections',
    navigation: { title: 'navigation.inspections', icon: ClipboardCheck },
    breadcrumb: { title: 'navigation.inspections' },
    path: '/inspections',
  },
  {
    auth: 'required',
    access: { resource: 'inspections', action: 'access' },
    componentLoader: () => import('./pages/inspections/detail.js'),
    name: 'inspection-detail',
    breadcrumb: { title: 'navigation.inspectionDetail' },
    path: '/inspections/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/repairs/index.js'),
    name: 'repairs',
    navigation: { title: 'navigation.repairs', icon: Wrench },
    breadcrumb: { title: 'navigation.repairs' },
    path: '/repairs',
  },
  {
    auth: 'required',
    access: { resource: 'repairs', action: 'access' },
    componentLoader: () => import('./pages/repairs/detail.js'),
    name: 'repair-detail',
    breadcrumb: { title: 'navigation.repairDetail' },
    path: '/repairs/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/review/index.js'),
    name: 'review',
    navigation: { title: 'navigation.review', icon: ClipboardCheck },
    breadcrumb: { title: 'navigation.review' },
    path: '/review',
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
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
