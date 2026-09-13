import { FolderKanban, Home } from 'lucide-react';
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
    name: 'delivery',
    navigation: { title: 'navigation.delivery', icon: FolderKanban },
    children: [
      {
        name: 'delivery-dashboard',
        path: '/delivery/dashboard',
        navigation: { title: 'navigation.deliveryDashboard' },
        componentLoader: () => import('./pages/delivery-dashboard.js'),
      },
      {
        name: 'delivery-projects',
        path: '/delivery/projects',
        navigation: { title: 'navigation.deliveryProjects' },
        componentLoader: () => import('./pages/delivery-projects.js'),
      },
      {
        name: 'delivery-milestones',
        path: '/delivery/milestones',
        navigation: { title: 'navigation.deliveryMilestones' },
        componentLoader: () => import('./pages/delivery-milestones.js'),
      },
      {
        name: 'delivery-tasks',
        path: '/delivery/tasks',
        navigation: { title: 'navigation.deliveryTasks' },
        componentLoader: () => import('./pages/delivery-tasks.js'),
      },
      {
        name: 'delivery-timesheets',
        path: '/delivery/timesheets',
        navigation: { title: 'navigation.deliveryTimesheets' },
        componentLoader: () => import('./pages/delivery-timesheets.js'),
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
