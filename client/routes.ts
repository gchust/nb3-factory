import { Home, Images } from 'lucide-react';
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
    name: 'products',
    path: '/products',
    auth: 'required',
    navigation: { title: 'navigation.products', icon: Images },
    componentLoader: () => import('./pages/products/index.js'),
  },
  {
    name: 'products.new',
    path: '/products/new',
    auth: 'required',
    componentLoader: () => import('./pages/products/new.js'),
  },
  {
    name: 'products.detail',
    path: '/products/:id',
    auth: 'required',
    componentLoader: () => import('./pages/products/detail.js'),
  },
  {
    name: 'products.edit',
    path: '/products/:id/edit',
    auth: 'required',
    componentLoader: () => import('./pages/products/edit.js'),
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
