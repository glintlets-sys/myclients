import { Routes } from '@angular/router';
import { AdminComponent } from './admin/admin.component';
import { LoginComponent } from './login/login.component';
import { staffGuard } from './core/staff-guard';
import { mobileRedirectGuard } from './mobile/m-common';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, title: 'Sign in · Store admin' },
  // Mobile admin: separate mobile-first screens (phones land here automatically; see mobile/m-common.ts).
  { path: 'm', canActivate: [staffGuard], loadChildren: () => import('./mobile/mobile.routes').then(m => m.MOBILE_ROUTES) },
  // The admin shell switches screens with ?section= (and deep links like ?section=orders&order=<id>).
  { path: '', component: AdminComponent, canActivate: [staffGuard, mobileRedirectGuard], title: 'Store admin' },
  // Old storefront-style links: /admin?section=… → /?section=…
  { path: 'admin', redirectTo: '', pathMatch: 'full' },
  { path: '**', redirectTo: '' }
];
