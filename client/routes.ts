import { Home, Wallet } from 'lucide-react';
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
    name: 'expense',
    navigation: { title: 'navigation.expense', icon: Wallet },
    children: [
      {
        name: 'expense-claims',
        path: '/expenses/claims',
        auth: 'required',
        navigation: { title: 'navigation.expenseClaims' },
        componentLoader: () => import('./pages/expense/claims.js'),
      },
      {
        name: 'expense-claim-new',
        path: '/expenses/claims/new',
        auth: 'required',
        componentLoader: () => import('./pages/expense/claim-new.js'),
      },
      {
        name: 'expense-claim-edit',
        path: '/expenses/claims/:id/edit',
        auth: 'required',
        componentLoader: () => import('./pages/expense/claim-edit.js'),
      },
      {
        name: 'expense-claim-detail',
        path: '/expenses/claims/:id',
        auth: 'required',
        componentLoader: () => import('./pages/expense/claim-detail.js'),
      },
      {
        name: 'expense-loans',
        path: '/expenses/loans',
        auth: 'required',
        navigation: { title: 'navigation.expenseLoans' },
        componentLoader: () => import('./pages/expense/loans.js'),
      },
      {
        name: 'expense-approvals',
        path: '/expenses/approvals',
        auth: 'required',
        navigation: { title: 'navigation.expenseApprovals' },
        componentLoader: () => import('./pages/expense/approvals.js'),
      },
      {
        name: 'expense-payments',
        path: '/expenses/payments',
        auth: 'required',
        navigation: { title: 'navigation.expensePayments' },
        componentLoader: () => import('./pages/expense/payments.js'),
      },
      {
        name: 'expense-stats',
        path: '/expenses/stats',
        auth: 'required',
        navigation: { title: 'navigation.expenseStats' },
        componentLoader: () => import('./pages/expense/stats.js'),
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
