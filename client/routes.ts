import { GraduationCap, Home } from 'lucide-react';
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
    name: 'training',
    navigation: { title: 'navigation.training', icon: GraduationCap },
    breadcrumb: { title: 'navigation.training' },
    children: [
      {
        name: 'trainingCatalog',
        path: '/training/catalog',
        navigation: { title: 'navigation.trainingCatalog' },
        breadcrumb: { title: 'navigation.trainingCatalog' },
        componentLoader: () => import('./pages/training/catalog.js'),
      },
      {
        name: 'trainingMyLearning',
        path: '/training/my-learning',
        navigation: { title: 'navigation.trainingMyLearning' },
        breadcrumb: { title: 'navigation.trainingMyLearning' },
        componentLoader: () => import('./pages/training/my-learning.js'),
      },
      {
        name: 'trainingGrading',
        path: '/training/grading',
        navigation: { title: 'navigation.trainingGrading' },
        breadcrumb: { title: 'navigation.trainingGrading' },
        componentLoader: () => import('./pages/training/grading.js'),
      },
      {
        name: 'trainingStats',
        path: '/training/stats',
        navigation: { title: 'navigation.trainingStats' },
        breadcrumb: { title: 'navigation.trainingStats' },
        componentLoader: () => import('./pages/training/stats.js'),
      },
      {
        name: 'trainingManage',
        path: '/training/manage',
        navigation: { title: 'navigation.trainingManage' },
        breadcrumb: { title: 'navigation.trainingManage' },
        componentLoader: () => import('./pages/training/manage/index.js'),
        children: [
          {
            name: 'trainingManageCourses',
            path: 'courses',
            componentLoader: () => import('./pages/training/manage/courses.js'),
          },
          {
            name: 'trainingManageSessions',
            path: 'sessions',
            componentLoader: () =>
              import('./pages/training/manage/sessions.js'),
          },
        ],
      },
      {
        name: 'trainingSessionDetail',
        path: '/training/sessions/:sessionId',
        breadcrumb: { title: 'navigation.trainingSessionDetail' },
        componentLoader: () => import('./pages/training/session-detail.js'),
      },
      {
        name: 'trainingAssignmentDetail',
        path: '/training/assignments/:assignmentId',
        breadcrumb: { title: 'navigation.trainingAssignmentDetail' },
        componentLoader: () => import('./pages/training/assignment-detail.js'),
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
