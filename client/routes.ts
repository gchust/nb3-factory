import {
  BarChart3,
  Building2,
  CalendarClock,
  Home,
  Target,
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
    // A menu-only group. Its children render directly in the application shell.
    name: 'crm',
    navigation: { title: 'navigation.crm' },
    children: [
      {
        auth: 'required',
        componentLoader: () => import('./pages/crm/customers.js'),
        name: 'crmCustomers',
        navigation: { title: 'navigation.crmCustomers', icon: Building2 },
        path: '/crm/customers',
      },
      {
        // Detail page: no navigation entry, and `:customerId` is not a menu target.
        auth: 'required',
        componentLoader: () => import('./pages/crm/customer-detail.js'),
        name: 'crmCustomerDetail',
        path: '/crm/customers/:customerId',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/crm/opportunities.js'),
        name: 'crmOpportunities',
        navigation: { title: 'navigation.crmOpportunities', icon: Target },
        path: '/crm/opportunities',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/crm/follow-ups.js'),
        name: 'crmFollowUps',
        navigation: { title: 'navigation.crmFollowUps', icon: CalendarClock },
        path: '/crm/follow-ups',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/crm/funnel.js'),
        name: 'crmFunnel',
        navigation: { title: 'navigation.crmFunnel', icon: BarChart3 },
        path: '/crm/funnel',
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
