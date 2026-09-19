import {
  ClipboardCheck,
  Flag,
  FolderKanban,
  Home,
  LayoutDashboard,
  ListChecks,
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
    componentLoader: () => import('./pages/dashboard.js'),
    name: 'dashboard',
    navigation: { title: 'navigation.dashboard', icon: LayoutDashboard },
    path: '/dashboard',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/projects.js'),
    name: 'projects',
    navigation: { title: 'navigation.projects', icon: FolderKanban },
    path: '/projects',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/project-detail.js'),
    name: 'project-detail',
    path: '/projects/:projectId',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/my-tasks.js'),
    name: 'my-tasks',
    navigation: { title: 'navigation.myTasks', icon: ListChecks },
    path: '/my-tasks',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/milestones.js'),
    name: 'milestones',
    navigation: { title: 'navigation.milestones', icon: Flag },
    path: '/milestones',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/milestone-detail.js'),
    name: 'milestone-detail',
    path: '/milestones/:milestoneId',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/task-detail.js'),
    name: 'task-detail',
    path: '/tasks/:taskId',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/review.js'),
    name: 'review',
    navigation: { title: 'navigation.review', icon: ClipboardCheck },
    path: '/review',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/submission-detail.js'),
    name: 'submission-detail',
    path: '/submissions/:submissionId',
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
