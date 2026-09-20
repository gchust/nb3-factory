import { BookOpen, ClipboardList, Home, Library } from 'lucide-react';
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
    breadcrumb: { title: 'navigation.library' },
    componentLoader: () => import('./pages/library/index.js'),
    name: 'library',
    navigation: { title: 'navigation.library', icon: Library },
    path: '/library',
  },
  {
    auth: 'required',
    breadcrumb: { title: 'navigation.libraryDetail' },
    componentLoader: () => import('./pages/library/detail.js'),
    name: 'library-detail',
    path: '/library/:id',
  },
  {
    auth: 'required',
    breadcrumb: { title: 'navigation.myBorrowings' },
    componentLoader: () => import('./pages/library/my-borrowings.js'),
    name: 'my-borrowings',
    navigation: { title: 'navigation.myBorrowings', icon: BookOpen },
    path: '/my-borrowings',
  },
  {
    auth: 'required',
    breadcrumb: { title: 'navigation.borrowingsAdmin' },
    componentLoader: () => import('./pages/library/borrowings-admin.js'),
    name: 'borrowings-admin',
    navigation: { title: 'navigation.borrowingsAdmin', icon: ClipboardList },
    path: '/borrowings-admin',
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
