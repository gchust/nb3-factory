import {
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  Home,
  UsersRound,
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
    name: 'hr',
    navigation: { title: 'navigation.hr', icon: UsersRound },
    children: [
      {
        auth: 'required',
        name: 'hrEmployees',
        path: '/hr/employees',
        navigation: { title: 'navigation.hrEmployees', icon: UsersRound },
        componentLoader: () => import('./pages/hr/employees.js'),
      },
      {
        auth: 'required',
        name: 'hrDepartments',
        path: '/hr/departments',
        navigation: { title: 'navigation.hrDepartments', icon: Building2 },
        componentLoader: () => import('./pages/hr/departments.js'),
      },
      {
        auth: 'required',
        name: 'hrLeaveRequests',
        path: '/hr/leave',
        navigation: { title: 'navigation.hrLeave', icon: CalendarDays },
        componentLoader: () => import('./pages/hr/leave-requests.js'),
      },
      {
        auth: 'required',
        name: 'hrOvertimeRequests',
        path: '/hr/overtime',
        navigation: { title: 'navigation.hrOvertime', icon: Clock },
        componentLoader: () => import('./pages/hr/overtime-requests.js'),
      },
      {
        // No navigation entry: approval actions live on the leave and
        // overtime pages, and a regular employee must not see an approval
        // entry at all. The page stays reachable for approvers who link to it.
        auth: 'required',
        name: 'hrApprovals',
        path: '/hr/approvals',
        componentLoader: () => import('./pages/hr/approvals.js'),
      },
      {
        auth: 'required',
        name: 'hrStatistics',
        path: '/hr/statistics',
        navigation: { title: 'navigation.hrStatistics', icon: BarChart3 },
        componentLoader: () => import('./pages/hr/statistics.js'),
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
