import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { BarChart3, Building2, Home, Receipt, ReceiptText } from 'lucide-react';

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
    // One page permission covers the whole expense surface; the server checks every endpoint separately.
    access: { resource: 'expense-app', action: 'access' },
    componentLoader: () => import('./pages/expense-claims.js'),
    name: 'expense-claims',
    navigation: { title: 'navigation.expenseClaims', icon: ReceiptText },
    path: '/expense/claims',
  },
  {
    auth: 'required',
    access: { resource: 'expense-app', action: 'access' },
    componentLoader: () => import('./pages/expense-claim-detail.js'),
    name: 'expense-claim-detail',
    path: '/expense/claims/:id',
  },
  {
    auth: 'required',
    access: { resource: 'expense-app', action: 'access' },
    componentLoader: () => import('./pages/expense-receipts.js'),
    name: 'expense-receipts',
    navigation: { title: 'navigation.expenseReceipts', icon: Receipt },
    path: '/expense/receipts',
  },
  {
    auth: 'required',
    access: { resource: 'expense-app', action: 'access' },
    componentLoader: () => import('./pages/expense-statistics.js'),
    name: 'expense-statistics',
    navigation: { title: 'navigation.expenseStatistics', icon: BarChart3 },
    path: '/expense/statistics',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    access: { resource: 'expense-admin', action: 'read' },
    componentLoader: () => import('./pages/expense-departments.js'),
    name: 'expense-departments',
    navigation: { title: 'navigation.expenseDepartments', icon: Building2 },
    path: '/expense/departments',
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
