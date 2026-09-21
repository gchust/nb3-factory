import {
  AlertTriangle,
  ClipboardCheck,
  FileCheck2,
  Home,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

// The compliance pages are application-owned. Their permissions come from the app-owned membership model
// (`organizationMembers`), enforced by the `/api/compliance/*` routes, not from the built-in page
// authorization tree. Each page therefore declares `authz: 'skip'` and enforces access itself.
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
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
  {
    auth: 'required',
    name: 'compliance',
    navigation: { title: 'navigation.compliance', icon: ShieldCheck },
    path: '/compliance',
    children: [
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/compliance/dashboard.js'),
        name: 'compliance-dashboard',
        navigation: {
          title: 'navigation.complianceDashboard',
          icon: LayoutDashboard,
          order: 10,
        },
        path: '',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/compliance/suppliers/index.js'),
        name: 'compliance-suppliers',
        navigation: {
          title: 'navigation.complianceSuppliers',
          icon: Users,
          order: 20,
        },
        path: 'suppliers',
      },
      {
        auth: 'required',
        authz: 'skip',
        breadcrumb: { title: 'navigation.complianceSupplierDetail' },
        componentLoader: () => import('./pages/compliance/suppliers/detail.js'),
        name: 'compliance-supplier-detail',
        path: 'suppliers/:id',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/compliance/qualifications.js'),
        name: 'compliance-qualifications',
        navigation: {
          title: 'navigation.complianceQualifications',
          icon: FileCheck2,
          order: 30,
        },
        path: 'qualifications',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/compliance/reviews.js'),
        name: 'compliance-reviews',
        navigation: {
          title: 'navigation.complianceReviews',
          icon: ClipboardCheck,
          order: 40,
        },
        path: 'reviews',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/compliance/contracts/index.js'),
        name: 'compliance-contracts',
        navigation: {
          title: 'navigation.complianceContracts',
          icon: ScrollText,
          order: 50,
        },
        path: 'contracts',
      },
      {
        auth: 'required',
        authz: 'skip',
        breadcrumb: { title: 'navigation.complianceContractDetail' },
        componentLoader: () => import('./pages/compliance/contracts/detail.js'),
        name: 'compliance-contract-detail',
        path: 'contracts/:id',
      },
      {
        auth: 'required',
        authz: 'skip',
        componentLoader: () => import('./pages/compliance/risks.js'),
        name: 'compliance-risks',
        navigation: {
          title: 'navigation.complianceRisks',
          icon: AlertTriangle,
          order: 60,
        },
        path: 'risks',
      },
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    // The page itself rejects anyone who is not an administrator; the app-owned membership model is the source of
    // truth, so the built-in page authorization tree is bypassed here as it is for the App pages.
    authz: 'skip',
    componentLoader: () => import('./pages/settings/compliance-access.js'),
    name: 'compliance-access',
    navigation: { title: 'navigation.complianceAccess', icon: ShieldCheck },
    path: 'compliance-access',
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
