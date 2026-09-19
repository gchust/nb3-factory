import {
  CalendarClock,
  Handshake,
  Home,
  LayoutDashboard,
  Users,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/dashboard.js'),
    name: 'dashboard',
    navigation: { title: 'navigation.dashboard', icon: LayoutDashboard },
    breadcrumb: { title: 'navigation.dashboard' },
    path: '/dashboard',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/customers/index.js'),
    name: 'customers',
    navigation: { title: 'navigation.customers', icon: Users },
    breadcrumb: { title: 'navigation.customers' },
    path: '/customers',
  },
  {
    // A dynamic record page has no menu entry; the list is its navigation target.
    auth: 'required',
    componentLoader: () => import('./pages/customers/detail.js'),
    name: 'customer-detail',
    breadcrumb: { title: 'navigation.customerDetail' },
    path: '/customers/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/opportunities/index.js'),
    name: 'opportunities',
    navigation: { title: 'navigation.opportunities', icon: Handshake },
    breadcrumb: { title: 'navigation.opportunities' },
    path: '/opportunities',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/opportunities/detail.js'),
    name: 'opportunity-detail',
    breadcrumb: { title: 'navigation.opportunityDetail' },
    path: '/opportunities/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/followups/index.js'),
    name: 'followups',
    navigation: { title: 'navigation.followups', icon: CalendarClock },
    breadcrumb: { title: 'navigation.followups' },
    path: '/followups',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/followups/detail.js'),
    name: 'followup-detail',
    breadcrumb: { title: 'navigation.followupDetail' },
    path: '/followups/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
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
