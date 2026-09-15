import { ChartColumn, Home, Images } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

// One page permission covers the library and its detail/new pages, so the page guard in
// `default-pages` grants a signed-in role access to the surface; the server still decides what
// each role may upload, edit or download.
const mediaAccess = { resource: 'media-assets', action: 'access' } as const;

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
    access: mediaAccess,
    componentLoader: () => import('./pages/media-assets.js'),
    name: 'media-assets',
    navigation: { title: 'navigation.mediaAssets', icon: Images },
    path: '/media-assets',
  },
  {
    auth: 'required',
    access: mediaAccess,
    componentLoader: () => import('./pages/media-asset-new.js'),
    name: 'media-assets-new',
    path: '/media-assets/new',
  },
  {
    auth: 'required',
    access: mediaAccess,
    componentLoader: () => import('./pages/media-asset-detail.js'),
    name: 'media-asset-detail',
    path: '/media-assets/:id',
  },
  {
    auth: 'required',
    access: { resource: 'media-stats', action: 'access' },
    componentLoader: () => import('./pages/media-stats.js'),
    name: 'media-stats',
    navigation: { title: 'navigation.mediaStats', icon: ChartColumn },
    path: '/media-stats',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
