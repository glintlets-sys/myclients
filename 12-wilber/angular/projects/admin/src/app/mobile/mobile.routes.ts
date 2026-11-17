import { Routes } from '@angular/router';
import { MShellComponent } from './m-shell.component';

/** /m/... — the mobile admin. Each screen is lazy-loaded so the desktop admin bundle does not grow. */
export const MOBILE_ROUTES: Routes = [
  {
    path: '',
    component: MShellComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', data: { title: 'Today', root: true }, loadComponent: () => import('./m-home.component').then(m => m.MHomeComponent) },
      { path: 'orders', data: { title: 'Orders', root: true }, loadComponent: () => import('./m-orders.component').then(m => m.MOrdersComponent) },
      { path: 'orders/:id', data: { title: 'Order' }, loadComponent: () => import('./m-order.component').then(m => m.MOrderComponent) },
      { path: 'confirmations', data: { title: 'Confirm orders' }, loadComponent: () => import('./m-confirmations.component').then(m => m.MConfirmationsComponent) },
      { path: 'new-order', data: { title: 'New order', root: true }, loadComponent: () => import('./m-new-order.component').then(m => m.MNewOrderComponent) },
      { path: 'products', data: { title: 'Products', root: true }, loadComponent: () => import('./m-products.component').then(m => m.MProductsComponent) },
      { path: 'products/new', data: { title: 'New product' }, loadComponent: () => import('./m-product-new.component').then(m => m.MProductNewComponent) },
      { path: 'products/:id', data: { title: 'Edit product' }, loadComponent: () => import('./m-product.component').then(m => m.MProductComponent) },
      { path: 'categories', data: { title: 'Categories' }, loadComponent: () => import('./m-categories.component').then(m => m.MCategoriesComponent) },
      { path: 'customers', data: { title: 'Customers' }, loadComponent: () => import('./m-customers.component').then(m => m.MCustomersComponent) },
      { path: 'customers/:id', data: { title: 'Customer' }, loadComponent: () => import('./m-customers.component').then(m => m.MCustomerComponent) },
      { path: 'invoices', data: { title: 'Invoices' }, loadComponent: () => import('./m-money.component').then(m => m.MInvoicesComponent) },
      { path: 'reports', data: { title: 'Reports' }, loadComponent: () => import('./m-money.component').then(m => m.MReportsComponent) },
      { path: 'banners', data: { title: 'Banners' }, loadComponent: () => import('./m-content.component').then(m => m.MBannersComponent) },
      { path: 'publish', data: { title: 'Publish' }, loadComponent: () => import('./m-content.component').then(m => m.MPublishComponent) },
      { path: 'blogs', data: { title: 'Blogs' }, loadComponent: () => import('./m-content.component').then(m => m.MBlogsComponent) },
      { path: 'recommendations', data: { title: 'Recommendations' }, loadComponent: () => import('./m-content.component').then(m => m.MRecommendationsComponent) },
      { path: 'more', data: { title: 'More', root: true }, loadComponent: () => import('./m-admin.component').then(m => m.MMoreComponent) },
      { path: 'settings', data: { title: 'Settings' }, loadComponent: () => import('./m-admin.component').then(m => m.MSettingsComponent) },
      { path: 'users', data: { title: 'Staff' }, loadComponent: () => import('./m-admin.component').then(m => m.MUsersComponent) },
      { path: 'access', data: { title: 'Access control' }, loadComponent: () => import('./m-admin.component').then(m => m.MAccessComponent) },
      { path: 'profile', data: { title: 'My profile' }, loadComponent: () => import('./m-admin.component').then(m => m.MProfileComponent) },
      { path: '**', redirectTo: 'home' },
    ]
  }
];
