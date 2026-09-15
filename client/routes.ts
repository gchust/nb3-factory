import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Home,
  Monitor,
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
    name: 'inspection',
    navigation: { title: 'navigation.inspection', icon: ClipboardCheck },
    children: [
      {
        auth: 'required',
        componentLoader: () => import('./pages/inspection/records.js'),
        name: 'inspectionRecords',
        navigation: { title: 'navigation.inspectionRecords' },
        path: '/inspection/records',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/inspection/records-new.js'),
        name: 'inspectionRecordNew',
        path: '/inspection/records/new',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/inspection/records-detail.js'),
        name: 'inspectionRecordDetail',
        path: '/inspection/records/:recordId',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/inspection/abnormal.js'),
        name: 'inspectionAbnormal',
        navigation: {
          title: 'navigation.inspectionAbnormal',
          icon: AlertTriangle,
        },
        path: '/inspection/abnormal',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/inspection/statistics.js'),
        name: 'inspectionStatistics',
        navigation: {
          title: 'navigation.inspectionStatistics',
          icon: BarChart3,
        },
        path: '/inspection/statistics',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/inspection/devices.js'),
        name: 'inspectionDevices',
        navigation: { title: 'navigation.inspectionDevices', icon: Monitor },
        path: '/inspection/devices',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/inspection/plans.js'),
        name: 'inspectionPlans',
        navigation: {
          title: 'navigation.inspectionPlans',
          icon: CalendarClock,
        },
        path: '/inspection/plans',
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
