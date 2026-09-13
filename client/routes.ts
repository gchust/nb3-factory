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
    componentLoader: () => import('./pages/expense-claims.js'),
    name: 'expense-claims',
    navigation: { title: 'navigation.expenseClaims', icon: ReceiptText },
    path: '/expense-claims',
  },
  {
    // Reached from the list; no menu entry of its own.
    auth: 'required',
    componentLoader: () => import('./pages/expense-claim-detail.js'),
    name: 'expense-claim-detail',
    path: '/expense-claims/:id',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
