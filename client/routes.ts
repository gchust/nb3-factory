import {
  BarChart3,
  Banknote,
  ClipboardCheck,
  Home,
  Receipt,
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
    breadcrumb: { title: 'navigation.expenses' },
    componentLoader: () => import('./pages/expenses/index.js'),
    name: 'expenses',
    navigation: { title: 'navigation.expenses', icon: Receipt },
    path: '/expenses',
    children: [
      {
        name: 'expenseNew',
        path: 'new',
        componentLoader: () => import('./pages/expenses/new.js'),
      },
      {
        breadcrumb: { title: 'expenses.detail.title' },
        name: 'expenseDetail',
        path: ':reportId',
        componentLoader: () => import('./pages/expenses/detail.js'),
        children: [
          {
            name: 'expenseEdit',
            path: 'edit',
            componentLoader: () => import('./pages/expenses/edit.js'),
          },
        ],
      },
    ],
  },
  {
    auth: 'required',
    breadcrumb: { title: 'navigation.expenseApprovals' },
    componentLoader: () => import('./pages/expense-approvals.js'),
    name: 'expenseApprovals',
    navigation: { title: 'navigation.expenseApprovals', icon: ClipboardCheck },
    path: '/expense-approvals',
  },
  {
    auth: 'required',
    breadcrumb: { title: 'navigation.expenseFinance' },
    componentLoader: () => import('./pages/expense-finance.js'),
    name: 'expenseFinance',
    navigation: { title: 'navigation.expenseFinance', icon: Banknote },
    path: '/expense-finance',
  },
  {
    auth: 'required',
    breadcrumb: { title: 'navigation.expenseStatistics' },
    componentLoader: () => import('./pages/expense-statistics.js'),
    name: 'expenseStatistics',
    navigation: { title: 'navigation.expenseStatistics', icon: BarChart3 },
    path: '/expense-statistics',
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
