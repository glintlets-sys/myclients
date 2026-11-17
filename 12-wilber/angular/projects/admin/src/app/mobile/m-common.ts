import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ORDER_STATUS_LABEL, OrderStatus, PAYMENT_STATUS_LABEL, PaymentStatus } from '@shared/core/models';

/**
 * Mobile admin (/m/...): a separate set of mobile-first screens, not the desktop screens made responsive.
 * Phones open /m automatically; "Desktop view" / "Mobile view" switches are remembered per browser.
 */
const VIEW_KEY = 'glint.admin.view';

export type AdminView = 'mobile' | 'desktop';

export function preferredView(): AdminView | null {
  const v = localStorage.getItem(VIEW_KEY);
  return v === 'mobile' || v === 'desktop' ? v : null;
}

export function setPreferredView(v: AdminView): void {
  localStorage.setItem(VIEW_KEY, v);
}

/** Phones and small tablets in portrait (touch screen, narrow viewport). */
export function isPhone(): boolean {
  return window.matchMedia('(max-width: 820px)').matches
    && (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent));
}

/** On the desktop route: send phones to the mobile app unless the user chose the desktop view. */
export const mobileRedirectGuard: CanActivateFn = route => {
  const router = inject(Router);
  const pref = preferredView();
  if (pref === 'desktop' || (pref === null && !isPhone())) return true;
  // keep deep links working: ?section=orders&order=X -> /m/orders/X
  const section = route.queryParamMap.get('section');
  const order = route.queryParamMap.get('order');
  if (order) return router.createUrlTree(['/m/orders', order]);
  return router.createUrlTree(['/m', MOBILE_SECTION[section ?? ''] ?? 'home']);
};

/** Desktop ?section= -> mobile route. */
const MOBILE_SECTION: Record<string, string> = {
  dashboard: 'home', orders: 'orders', confirmations: 'confirmations', 'staff-order': 'new-order', invoices: 'invoices',
  products: 'products', categories: 'categories', customers: 'customers', banners: 'banners', seo: 'publish', reports: 'reports',
  blogs: 'blogs', recommendations: 'recommendations', settings: 'settings', 'admin-users': 'users',
  'access-control': 'access', profile: 'profile', quotes: 'more', collections: 'more', audit: 'more',
};

/** Mobile route -> desktop ?section= (for "Open in desktop view"). */
export const DESKTOP_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(MOBILE_SECTION).filter(([, m]) => m !== 'more').map(([d, m]) => [m, d]));

export function statusLabel(s: string): string {
  return ORDER_STATUS_LABEL[s as OrderStatus] ?? s;
}

export function paymentLabel(s: string): string {
  return PAYMENT_STATUS_LABEL[s as PaymentStatus] ?? s;
}

/** Colour family for an order status pill. */
export function statusTone(s: string): string {
  switch (s) {
    case 'DELIVERED': return 'ok';
    case 'CANCELLED': case 'RETURNED': return 'bad';
    case 'PENDING_PAYMENT': case 'PLACED': return 'warn';
    default: return 'info';
  }
}

/** Staff status changes the API accepts from each status (mirrors OrderStatus.next() on the server). */
export const NEXT_STATUS: Record<string, string[]> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PLACED: ['CONFIRMED', 'READY_TO_DISPATCH', 'DISPATCHED', 'CANCELLED'],
  CONFIRMED: ['READY_TO_DISPATCH', 'DISPATCHED', 'CANCELLED'],
  READY_TO_DISPATCH: ['DISPATCHED', 'CONFIRMED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

/** Phone number as a tel: / WhatsApp target (Indian 10-digit numbers get +91). */
export function telHref(phone?: string | null): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d ? 'tel:+' + (d.length === 10 ? '91' + d : d) : '';
}

export function waHref(phone?: string | null): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d ? 'https://wa.me/' + (d.length === 10 ? '91' + d : d) : '';
}

export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysBack(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

/** Leave the mobile app for a desktop screen (remembered until "Mobile view" is chosen again). */
export function openDesktop(section = 'dashboard'): void {
  setPreferredView('desktop');
  window.location.href = '/?section=' + encodeURIComponent(section);
}
