// Typed client for the operations endpoints (invoices, reports, staff orders, COD collections, confirmations,
// audit log, quotations). See glint-commerce-backend/docs/API.md → "Operations". All money values are paise.
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Address, Order, Quote } from '@shared/core/models';
import { InvoiceSummary, InvoiceView, Quotation, QuoteStatus, QuoteSummary } from '@shared/core/documents';

// The document types are shared with the storefront; re-exported so admin screens import them from one place.
export * from '@shared/core/documents';

type Params = Record<string, string | number | boolean | null | undefined>;

export interface PickerVariant { variantId: string; name: string; sku?: string; pricePaise: number; mrpPaise?: number; stock?: number; }
export interface PickerProduct { productId: string; name: string; code?: string; hsn?: string; thumbnail?: string; stockManaged: boolean; variants: PickerVariant[]; }

export interface CustomerLookup { phone: string; found: boolean; user?: { id: string; name?: string; email?: string; phone: string }; addresses: Address[]; }

export interface StaffOrderRequest {
  customer: { phone: string; name?: string; email?: string };
  addressId?: string;
  address?: Partial<Address>;
  items: { productId: string; variantId: string; qty: number }[];
  couponCode?: string;
  payment: { method: 'cod' | 'offline'; mode?: string; reference?: string };
  notes?: string;
}

export interface ConfirmationItem {
  id: string; createdAt: string; ageMinutes: number; customerName?: string; customerPhone?: string; city?: string; state?: string;
  paymentMethod: string; paymentStatus: string; totalPaise: number; channel: string; notes?: string;
  items: { name: string; variantName?: string; qty: number; lineTotalPaise: number }[];
}

export interface OutstandingCod {
  orderId: string; customerName?: string; customerPhone?: string; city?: string; totalPaise: number; collectedPaise: number;
  outstandingPaise: number; paymentStatus: string; orderDate: string; deliveredAt?: string; courier?: string; awb?: string; ageDays: number;
}

export interface CodCollection {
  id: string; key?: string; orderId: string; amountPaise: number; date: string; mode: string; reference?: string; collectedBy?: string;
  note?: string; recordedBy?: string; createdAt: string; voided?: boolean; voidReason?: string; customerName?: string; customerPhone?: string;
}

export interface AuditEntry {
  id: string; at: string; actorId: string; actorName?: string; actorPhone?: string; role: string; method: string; route: string;
  path: string; action: string; entityType?: string; entityId?: string; summary?: string; status: number; error?: string; ip?: string;
}

export interface PageResult<T> { items: T[]; nextCursor?: string | null; }

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Draft', SENT: 'Sent', REVISED: 'Revised', ACCEPTED: 'Accepted', REJECTED: 'Rejected', EXPIRED: 'Expired',
};

export const COLLECTION_MODES = [
  { id: 'cash', label: 'Cash' }, { id: 'upi', label: 'UPI' }, { id: 'bank', label: 'Bank transfer' },
  { id: 'cheque', label: 'Cheque' }, { id: 'courier', label: 'Courier COD remittance' },
];

/** Operations endpoints. Kept apart from ApiService so the core client stays small. */
@Injectable({ providedIn: 'root' })
export class AdminOpsApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Orders waiting for confirmation (sidebar badge). Refreshed by the confirmations screen and the admin shell. */
  readonly pendingCount = signal(0);

  private get<T>(path: string, params?: Params) { return this.http.get<T>(this.base + path, { params: toParams(params) }); }
  private post<T>(path: string, body: unknown = {}) { return this.http.post<T>(this.base + path, body); }
  private put<T>(path: string, body: unknown = {}) { return this.http.put<T>(this.base + path, body); }
  private del<T>(path: string) { return this.http.delete<T>(this.base + path); }

  // invoices
  invoices(params: { from?: string; to?: string; q?: string; status?: string }) {
    return this.get<{ from: string; to: string; items: InvoiceSummary[]; totals: { count: number; taxablePaise: number; taxPaise: number; totalPaise: number } }>('/v1/admin/invoices', params);
  }
  orderInvoice(orderId: string) { return this.get<InvoiceView>(`/v1/admin/orders/${encodeURIComponent(orderId)}/invoice`); }
  issueInvoice(orderId: string) { return this.post<InvoiceView>(`/v1/admin/orders/${encodeURIComponent(orderId)}/invoice`); }
  // reports
  salesReport(from: string, to: string, groupBy: 'day' | 'month') { return this.get<any>('/v1/admin/reports/sales', { from, to, groupBy }); }
  productReport(from: string, to: string) { return this.get<any>('/v1/admin/reports/products', { from, to }); }
  categoryReport(from: string, to: string) { return this.get<any>('/v1/admin/reports/categories', { from, to }); }
  gstReport(from: string, to: string) { return this.get<any>('/v1/admin/reports/gst', { from, to }); }

  // staff orders
  catalogPicker(q?: string) { return this.get<{ products: PickerProduct[] }>('/v1/admin/catalog-picker', { q }); }
  lookupCustomer(phone: string) { return this.get<CustomerLookup>('/v1/admin/staff-orders/customer', { phone }); }
  staffQuote(body: StaffOrderRequest) { return this.post<Quote>('/v1/admin/staff-orders/quote', body); }
  placeStaffOrder(body: StaffOrderRequest) { return this.post<Order>('/v1/admin/staff-orders', body); }

  // confirmations
  confirmations() {
    return this.get<{ items: ConfirmationItem[]; count: number }>('/v1/admin/confirmations').pipe(tap(r => this.pendingCount.set(r.count)));
  }
  refreshPendingCount() {
    this.get<{ count: number }>('/v1/admin/confirmations/count').subscribe({ next: r => this.pendingCount.set(r.count), error: () => {} });
  }
  confirmOrders(orderIds: string[], note?: string) {
    return this.post<{ confirmed: number; failed: number; results: { id: string; ok: boolean; message?: string }[] }>('/v1/admin/confirmations/confirm', { orderIds, note });
  }
  cancelPending(orderId: string, reason: string) { return this.post<Order>(`/v1/admin/confirmations/${encodeURIComponent(orderId)}/cancel`, { reason }); }

  // COD collections
  outstandingCod() { return this.get<{ items: OutstandingCod[]; count: number; outstandingPaise: number }>('/v1/admin/collections/outstanding'); }
  collections(from: string, to: string) {
    return this.get<{ items: CodCollection[]; collectedPaise: number; byMode: Record<string, number> }>('/v1/admin/collections', { from, to });
  }
  orderCollections(orderId: string) {
    return this.get<{ orderId: string; totalPaise: number; collectedPaise: number; outstandingPaise: number; paymentStatus: string; items: CodCollection[] }>(
      `/v1/admin/orders/${encodeURIComponent(orderId)}/collections`);
  }
  recordCollection(orderId: string, body: { amountPaise: number; date?: string; mode: string; reference?: string; collectedBy?: string; note?: string }) {
    return this.post<{ collection: CodCollection; order: Order }>(`/v1/admin/orders/${encodeURIComponent(orderId)}/collections`, body);
  }
  voidCollection(key: string, reason: string) { return this.post<CodCollection>(`/v1/admin/collections/${encodeURIComponent(key)}/void`, { reason }); }

  // audit
  audit(params: { actor?: string; entityType?: string; entityId?: string; q?: string; size?: number; cursor?: string | null }) {
    return this.get<PageResult<AuditEntry>>('/v1/admin/audit', params as Params);
  }

  // quotations (staff)
  quotes(params: { status?: string; q?: string; size?: number; cursor?: string | null }) { return this.get<PageResult<QuoteSummary>>('/v1/admin/quotes', params as Params); }
  quote(id: string) { return this.get<Quotation>(`/v1/admin/quotes/${encodeURIComponent(id)}`); }
  previewQuote(body: Partial<Quotation>) { return this.post<Quotation>('/v1/admin/quotes/preview', body); }
  createQuote(body: Partial<Quotation>) { return this.post<Quotation>('/v1/admin/quotes', body); }
  updateQuote(id: string, body: Partial<Quotation>) { return this.put<Quotation>(`/v1/admin/quotes/${encodeURIComponent(id)}`, body); }
  deleteQuote(id: string) { return this.del<void>(`/v1/admin/quotes/${encodeURIComponent(id)}`); }
  duplicateQuote(id: string) { return this.post<Quotation>(`/v1/admin/quotes/${encodeURIComponent(id)}/duplicate`); }
  reviseQuote(id: string) { return this.post<Quotation>(`/v1/admin/quotes/${encodeURIComponent(id)}/revise`); }
  sendQuote(id: string) { return this.post<Quotation>(`/v1/admin/quotes/${encodeURIComponent(id)}/send`); }
  rejectQuote(id: string, reason?: string) { return this.post<Quotation>(`/v1/admin/quotes/${encodeURIComponent(id)}/reject`, { reason }); }
  acceptQuote(id: string, body: { paymentMethod?: string; mode?: string; reference?: string; note?: string }) {
    return this.post<{ quote: Quotation; order: Order; created: boolean }>(`/v1/admin/quotes/${encodeURIComponent(id)}/accept`, body);
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

