import { Home, ReceiptText } from 'lucide-react';
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
    componentLoader: () => import('./pages/expense-claims/list.js'),
    name: 'expense-claims',
    navigation: { title: 'navigation.expenseClaims', icon: ReceiptText },
    path: '/expense-claims',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/expense-claims/new.js'),
    name: 'expense-claims.new',
    path: '/expense-claims/new',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/expense-claims/detail.js'),
    name: 'expense-claims.detail',
    path: '/expense-claims/:id',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
