import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import {
  Address, Blog, CartLine, Category, Order, PageResult, PaymentAction, Product, ProductCard,
  PublicConfig, Quote, Session, User
} from './models';
import { InvoiceView, Quotation } from './documents';
import { GLINT_ENV } from './glint-env';
import { SessionService } from './session.service';

export type Params = Record<string, string | number | boolean | null | undefined>;

/**
 * Typed client for the Glint Commerce endpoints shared by the storefront and the admin app: catalog, auth,
 * account, orders, customer documents. The tenant-admin endpoints (/v1/admin/**) live in the admin app
 * (AdminApi extends this class), so the storefront bundle carries none of them.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly base = inject(GLINT_ENV).apiUrl;

  // ---------- generic ----------
  get<T>(path: string, params?: Params): Observable<T> {
    return this.http.get<T>(this.base + path, { params: toParams(params) });
  }
  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(this.base + path, body);
  }
  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.put<T>(this.base + path, body);
  }
  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.patch<T>(this.base + path, body);
  }
  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.base + path);
  }

  // ---------- storefront ----------
  config() { return this.get<PublicConfig>('/v1/config'); }
  categories() { return this.get<{ categories: Category[] }>('/v1/categories'); }
  products(params: Params) { return this.get<{ items: ProductCard[]; page: number; size: number; total: number }>('/v1/products', params); }
  product(idOrSlug: string) { return this.get<Product>(`/v1/products/${encodeURIComponent(idOrSlug)}`); }
  reviews(idOrSlug: string, cursor?: string) { return this.get<PageResult<any>>(`/v1/products/${encodeURIComponent(idOrSlug)}/reviews`, { cursor }); }
  addReview(idOrSlug: string, review: { rating: number; title?: string; comment?: string; name?: string }) {
    return this.post(`/v1/products/${encodeURIComponent(idOrSlug)}/reviews`, review);
  }
  blogs() { return this.get<{ blogs: Blog[] }>('/v1/blogs'); }
  blog(slug: string) { return this.get<Blog>(`/v1/blogs/${encodeURIComponent(slug)}`); }
  enquiry(body: { name: string; phone?: string; email?: string; subject?: string; message: string }) {
    return this.post('/v1/enquiries', body);
  }
  notifyMe(body: { variantId: string; phone?: string; email?: string }) { return this.post('/v1/notify-me', body); }
  quoteGuestCart(items: CartLine[], extra: { couponCode?: string; state?: string; pincode?: string } = {}) {
    return this.post<Quote>('/v1/cart/quote', { items, ...extra });
  }
  validateCoupon(code: string, subtotalPaise?: number) {
    return this.post<{ valid: boolean; code: string; description: string; type: string; value: number }>('/v1/coupons/validate', { code, subtotalPaise });
  }

  // ---------- auth ----------
  /** `staff`: admin-app login — non-staff numbers get no SMS and never get an account created. */
  requestOtp(phone: string, staff = false) {
    return this.post<{ sent: boolean; expiresInSeconds: number; devOtp?: string }>('/v1/auth/otp/request', staff ? { phone, staff } : { phone });
  }
  verifyOtp(phone: string, otp: string, cart?: CartLine[], staff = false) {
    return this.post<Session>('/v1/auth/otp/verify', staff ? { phone, otp, staff } : { phone, otp, cart }).pipe(tap(s => this.session.set(s)));
  }
  refresh() { return this.post<Session>('/v1/auth/refresh').pipe(tap(s => this.session.set(s))); }
  logout() { return this.post('/v1/auth/logout'); }

  // ---------- account ----------
  me() { return this.get<User>('/v1/me').pipe(tap(u => this.session.updateUser(u))); }
  updateMe(body: { name?: string; email?: string }) { return this.put<User>('/v1/me', body).pipe(tap(u => this.session.updateUser(u))); }
  addresses() { return this.get<{ addresses: Address[] }>('/v1/me/addresses'); }
  addAddress(a: Address) { return this.post<Address>('/v1/me/addresses', a); }
  updateAddress(id: string, a: Address) { return this.put<Address>(`/v1/me/addresses/${id}`, a); }
  deleteAddress(id: string) { return this.delete(`/v1/me/addresses/${id}`); }
  cart() { return this.get<{ items: CartLine[]; quote: Quote }>('/v1/me/cart'); }
  setCartItem(line: CartLine) { return this.put<{ items: CartLine[]; quote: Quote }>('/v1/me/cart/items', line); }
  removeCartItem(variantId: string) { return this.delete<{ items: CartLine[]; quote: Quote }>(`/v1/me/cart/items/${variantId}`); }
  mergeCart(items: CartLine[]) { return this.post<{ items: CartLine[]; quote: Quote }>('/v1/me/cart/merge', { items }); }
  clearCart() { return this.delete<{ items: CartLine[]; quote: Quote }>('/v1/me/cart'); }
  wishlist() { return this.get<{ items: ProductCard[] }>('/v1/me/wishlist'); }
  addToWishlist(productId: string) { return this.put(`/v1/me/wishlist/${productId}`); }
  removeFromWishlist(productId: string) { return this.delete(`/v1/me/wishlist/${productId}`); }

  // ---------- checkout & orders ----------
  checkoutSummary(body: { addressId?: string; couponCode?: string; paymentMethod?: string }) {
    return this.post<{ quote: Quote; addresses: Address[]; selectedAddressId?: string }>('/v1/checkout/summary', body);
  }
  placeOrder(body: { addressId: string; paymentMethod: string; couponCode?: string; notes?: string }) {
    return this.post<{ order: Order; payment: PaymentAction }>('/v1/orders', body);
  }
  orders(cursor?: string) { return this.get<PageResult<Order>>('/v1/orders', { cursor }); }
  order(id: string) { return this.get<Order>(`/v1/orders/${id}`); }
  payOrder(id: string) { return this.post<PaymentAction>(`/v1/orders/${id}/pay`); }
  verifyPayment(id: string, params: Record<string, string> = {}) { return this.post<Order>(`/v1/orders/${id}/verify-payment`, params); }
  cancelOrder(id: string, reason?: string) { return this.post<Order>(`/v1/orders/${id}/cancel`, { reason }); }
  tracking(id: string) { return this.get<any>(`/v1/orders/${id}/tracking`); }

  // ---------- customer documents ----------
  /** Customer: own order's GST invoice. */
  myInvoice(orderId: string) { return this.get<InvoiceView>(`/v1/orders/${encodeURIComponent(orderId)}/invoice`); }
  /** Quotation opened from the link the store sent (id + key). */
  publicQuote(id: string, k: string) { return this.get<Quotation>(`/v1/quotes/${encodeURIComponent(id)}`, { k }); }
  customerAcceptQuote(id: string, k: string, paymentMethod?: string) {
    return this.post<{ quote: Quotation; order: Order; payment: PaymentAction }>(`/v1/quotes/${encodeURIComponent(id)}/accept`, { k, paymentMethod });
  }
  customerRejectQuote(id: string, k: string, reason?: string) {
    return this.post<Quotation>(`/v1/quotes/${encodeURIComponent(id)}/reject`, { k, reason });
  }
}

function toParams(p?: Params): HttpParams {
  let params = new HttpParams();
  if (!p) return params;
  for (const [k, v] of Object.entries(p)) {
    if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
  }
  return params;
}
