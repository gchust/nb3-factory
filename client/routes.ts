import {
  Building2,
  CalendarClock,
  ClipboardList,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  Microscope,
  ShieldCheck,
} from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/**
 * Every business page declares `auth: 'required'` and `authz: 'skip'`.
 *
 * `auth` keeps the browser away from pages that need a session. `authz` is skipped on purpose: these
 * pages are not gated by an authorization permission set, they ask the API who the viewer is and what
 * they may see, and the server answers per laboratory and per record. A client-side page check would
 * only add a second, weaker copy of a rule that already binds on the server.
 */
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/dashboard/index.js'),
    name: 'dashboard',
    navigation: { title: 'navigation.dashboard', icon: LayoutDashboard },
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
    // A group owns no page of its own: it collects the modules into one navigation section.
    name: 'laboratory',
    auth: 'required',
    navigation: { title: 'navigation.laboratory', icon: FlaskConical },
    children: [
      {
        authz: 'skip',
        auth: 'required',
        breadcrumb: { title: 'navigation.laboratories' },
        componentLoader: () => import('./pages/laboratories/index.js'),
        name: 'laboratories',
        navigation: { title: 'navigation.laboratories', icon: Building2 },
        path: '/laboratories',
      },
      {
        authz: 'skip',
        auth: 'required',
        breadcrumb: { title: 'navigation.equipment' },
        componentLoader: () => import('./pages/equipment/index.js'),
        name: 'equipment',
        navigation: { title: 'navigation.equipment', icon: Microscope },
        path: '/equipment',
        children: [
          {
            authz: 'skip',
            auth: 'required',
            breadcrumb: { title: 'breadcrumb.equipmentDetail' },
            componentLoader: () => import('./pages/equipment/detail.js'),
            name: 'equipment-detail',
            // Relative to the parent: the parent path is prepended, so declaring the full path here would repeat it.
            path: ':equipmentId',
          },
        ],
      },
      {
        authz: 'skip',
        auth: 'required',
        breadcrumb: { title: 'navigation.calibrations' },
        componentLoader: () => import('./pages/calibrations/index.js'),
        name: 'calibrations',
        navigation: { title: 'navigation.calibrations', icon: CalendarClock },
        path: '/calibrations',
      },
      {
        authz: 'skip',
        auth: 'required',
        breadcrumb: { title: 'navigation.workOrders' },
        componentLoader: () => import('./pages/work-orders/index.js'),
        name: 'work-orders',
        navigation: { title: 'navigation.workOrders', icon: ClipboardList },
        path: '/work-orders',
        children: [
          {
            authz: 'skip',
            auth: 'required',
            breadcrumb: { title: 'breadcrumb.workOrderDetail' },
            componentLoader: () => import('./pages/work-orders/detail.js'),
            name: 'work-order-detail',
            // Relative, for the same reason as the equipment detail route above.
            path: ':workOrderId',
          },
        ],
      },
      {
        authz: 'skip',
        auth: 'required',
        breadcrumb: { title: 'navigation.safetyChecks' },
        componentLoader: () => import('./pages/safety-checks/index.js'),
        name: 'safety-checks',
        navigation: { title: 'navigation.safetyChecks', icon: ShieldCheck },
        path: '/safety-checks',
      },
      {
        authz: 'skip',
        auth: 'required',
        breadcrumb: { title: 'navigation.trainingRecords' },
        componentLoader: () => import('./pages/training-records/index.js'),
        name: 'training-records',
        navigation: {
          title: 'navigation.trainingRecords',
          icon: GraduationCap,
        },
        path: '/training-records',
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
