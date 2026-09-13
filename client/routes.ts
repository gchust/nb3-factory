import { Home, IdCard } from 'lucide-react';
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
    componentLoader: () => import('./pages/employees.js'),
    name: 'employees',
    navigation: { title: 'navigation.employees', icon: IdCard },
    path: '/employees',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/employee-detail.js'),
    name: 'employeeDetail',
    path: '/employees/:employeeId',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
