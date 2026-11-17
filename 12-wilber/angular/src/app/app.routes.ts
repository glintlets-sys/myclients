import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AboutComponent } from './about/about.component';
import { BlogsComponent } from './blogs/blogs.component';
import { BlogDetailComponent } from './blog-detail/blog-detail.component';
import { ContactUsComponent } from './contact-us/contact-us.component';
import { StoneSolutionsComponent } from './stone-solutions/stone-solutions.component';
import { CategoryDetailComponent } from './category-detail/category-detail.component';
import { ProductComponent } from './product/product.component';
import { CheckoutComponent } from './checkout/checkout.component';
import { LoginComponent } from './login/login.component';
import { AccountComponent } from './account/account.component';
import { PaymentResponseComponent } from './payment-response/payment-response.component';
import { adminRedirectGuard, authGuard } from './core/guards';

/**
 * Clean, crawlable URLs: /category/<slug>, /product/<slug>, /blog/<slug>. These (plus /, /stone-solutions, /blogs)
 * are also pre-rendered at publish time and served by CloudFront from the CDN (see README "SEO").
 * `data.seo`: 'managed' = the page sets its own tags through SeoService; otherwise route-level title / noindex.
 */
export const routes: Routes = [
  { path: '', component: HomeComponent, data: { seo: 'managed' } },
  { path: 'home', redirectTo: '', pathMatch: 'full' },
  { path: 'aboutus', component: AboutComponent, data: { seo: { title: 'About us' } } },
  { path: 'blogs', component: BlogsComponent, data: { seo: 'managed' } },
  { path: 'blog/:slug', component: BlogDetailComponent, data: { seo: 'managed' } },
  { path: 'contact', component: ContactUsComponent, data: { seo: { title: 'Contact us' } } },
  { path: 'stone-solutions', component: StoneSolutionsComponent, data: { seo: 'managed' } },
  { path: 'category/:slug', component: CategoryDetailComponent, data: { seo: 'managed' } },
  // Old URL: /stone-solution/<slug or id> → /category/<…> (the page then swaps an id for the slug).
  { path: 'stone-solution/:category', redirectTo: 'category/:category' },
  // /product/<slug>; old links with a product id are swapped for the slug URL in the page (replaceUrl).
  { path: 'product/:slug', component: ProductComponent, data: { seo: 'managed' } },
  { path: 'checkout', component: CheckoutComponent, canActivate: [authGuard], data: { seo: { title: 'Checkout', noindex: true } } },
  { path: 'login', component: LoginComponent, data: { seo: { title: 'Sign in', noindex: true } } },
  { path: 'account', component: AccountComponent, canActivate: [authGuard], data: { seo: { title: 'My account', noindex: true } } },
  { path: 'orders', component: AccountComponent, canActivate: [authGuard], data: { seo: { title: 'My orders', noindex: true } } },
  // The tenant admin is its own app (projects/admin) on environment.adminUrl.
  { path: 'admin', children: [], canActivate: [adminRedirectGuard] },
  { path: 'payment-response', component: PaymentResponseComponent, data: { seo: { title: 'Payment', noindex: true } } },
  { path: 'quote/:id', loadComponent: () => import('./quote-view/quote-view.component').then(m => m.QuoteViewComponent),
    data: { seo: { title: 'Quotation', noindex: true } } },
  { path: '**', redirectTo: '' }
];
