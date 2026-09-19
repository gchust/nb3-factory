import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Home,
  Package,
  Search,
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
    name: 'quality',
    navigation: { title: 'navigation.quality', icon: ClipboardCheck },
    children: [
      {
        name: 'quality-batches',
        path: '/quality/batches',
        navigation: { title: 'navigation.qualityBatches', icon: Package },
        breadcrumb: { title: 'navigation.qualityBatches' },
        componentLoader: () => import('./pages/quality/batches/index.js'),
        children: [
          {
            name: 'quality-batch-create',
            path: 'create',
            componentLoader: () => import('./pages/quality/batches/create.js'),
          },
          {
            name: 'quality-product-create',
            path: 'create-product',
            componentLoader: () =>
              import('./pages/quality/batches/create-product.js'),
          },
        ],
      },
      {
        name: 'quality-tasks',
        path: '/quality/tasks',
        navigation: { title: 'navigation.qualityTasks', icon: ClipboardList },
        breadcrumb: { title: 'navigation.qualityTasks' },
        componentLoader: () => import('./pages/quality/tasks/index.js'),
        children: [
          {
            name: 'quality-task-create',
            path: 'create',
            componentLoader: () => import('./pages/quality/tasks/create.js'),
          },
          {
            name: 'quality-task-detail',
            path: ':taskId',
            breadcrumb: { title: 'navigation.qualityTasks' },
            componentLoader: () => import('./pages/quality/tasks/detail.js'),
          },
        ],
      },
      {
        name: 'quality-my-inspections',
        path: '/quality/my-inspections',
        navigation: {
          title: 'navigation.qualityMyInspections',
          icon: Search,
        },
        breadcrumb: { title: 'navigation.qualityMyInspections' },
        componentLoader: () =>
          import('./pages/quality/my-inspections/index.js'),
        children: [
          {
            name: 'quality-inspection-run',
            path: ':taskId',
            breadcrumb: { title: 'navigation.qualityMyInspections' },
            componentLoader: () =>
              import('./pages/quality/my-inspections/run.js'),
          },
        ],
      },
      {
        name: 'quality-results',
        path: '/quality/results',
        navigation: { title: 'navigation.qualityResults', icon: FileCheck2 },
        breadcrumb: { title: 'navigation.qualityResults' },
        componentLoader: () => import('./pages/quality/results/index.js'),
        children: [
          {
            name: 'quality-result-detail',
            path: ':taskId',
            breadcrumb: { title: 'navigation.qualityResults' },
            componentLoader: () => import('./pages/quality/results/detail.js'),
          },
        ],
      },
      {
        name: 'quality-rectifications',
        path: '/quality/rectifications',
        navigation: { title: 'navigation.qualityRectifications', icon: Wrench },
        breadcrumb: { title: 'navigation.qualityRectifications' },
        componentLoader: () =>
          import('./pages/quality/rectifications/index.js'),
        children: [
          {
            name: 'quality-rectification-detail',
            path: ':id',
            componentLoader: () =>
              import('./pages/quality/rectifications/detail.js'),
          },
        ],
      },
      {
        name: 'quality-stats',
        path: '/quality/stats',
        navigation: { title: 'navigation.qualityStats', icon: BarChart3 },
        breadcrumb: { title: 'navigation.qualityStats' },
        componentLoader: () => import('./pages/quality/stats/index.js'),
      },
    ],
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
