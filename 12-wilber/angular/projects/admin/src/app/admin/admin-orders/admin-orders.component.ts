import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import * as XLSX from 'xlsx';
import { AdminApi } from '../../core/admin-api';
import { MoneyPipe, formatPaise } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import {
  Order, OrderStatus, PaymentStatus, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL
} from '@shared/core/models';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { AdminOpsApi } from '../../core/admin-ops-api';
import { docFileName, downloadHtmlDocument, printHtmlDocument } from '@shared/core/print-doc';

/** Statuses at which the server issues a GST invoice (InvoiceService.INVOICEABLE). */
const INVOICEABLE: OrderStatus[] = ['CONFIRMED', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED'];

/** Staff status changes the API accepts from each status (mirrors OrderStatus.next() on the server). */
const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PLACED: ['CONFIRMED', 'READY_TO_DISPATCH', 'DISPATCHED', 'CANCELLED'],
  CONFIRMED: ['READY_TO_DISPATCH', 'DISPATCHED', 'CANCELLED'],
  READY_TO_DISPATCH: ['DISPATCHED', 'CONFIRMED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

interface OrderRow {
  order: Order;
  showDetails: boolean;
  loadingDetail: boolean;
  tracking?: any;
  trackingError?: string;
  loadingTracking?: boolean;
  /** Status-change form. */
  newStatus: OrderStatus | '';
  note: string;
  courier: string;
  awb: string;
  trackingUrl: string;
  busy: boolean;
}

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MoneyPipe],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.scss'
})
export class AdminOrdersComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);
  private readonly route = inject(ActivatedRoute);
  private readonly ops = inject(AdminOpsApi);

  readonly statusOptions = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];
  readonly paymentStatusOptions = Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[];
  readonly pageSize = 20;

  rows: OrderRow[] = [];
  nextCursor: string | null = null;
  isLoading = false;
  isLoadingMore = false;
  error = '';

  // Filters (server-side)
  searchTerm = '';
  selectedStatus: OrderStatus | '' = '';
  selectedPaymentStatus: PaymentStatus | '' = '';
  dateFrom = '';
  dateTo = '';

  private readonly search$ = new Subject<void>();
  private subscriptions: Subscription[] = [];
  private focusOrderId: string | null = null;

  ngOnInit(): void {
    this.focusOrderId = this.route.snapshot.queryParamMap.get('order');
    if (this.focusOrderId) this.searchTerm = this.focusOrderId;
    this.subscriptions.push(this.search$.pipe(debounceTime(350)).subscribe(() => this.loadOrders()));
    this.loadOrders();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  // ---------- list ----------

  private params(cursor?: string | null) {
    return {
      status: this.selectedStatus,
      paymentStatus: this.selectedPaymentStatus,
      q: this.searchTerm.trim(),
      from: this.dateFrom,
      to: this.dateTo,
      size: this.pageSize,
      cursor: cursor ?? undefined,
    };
  }

  loadOrders(): void {
    this.isLoading = true;
    this.error = '';
    this.api.admin.orders(this.params()).subscribe({
      next: page => {
        this.rows = page.items.map(o => this.toRow(o));
        this.nextCursor = page.nextCursor ?? null;
        this.isLoading = false;
        if (this.focusOrderId) {
          const row = this.rows.find(r => r.order.id === this.focusOrderId);
          if (row) this.toggleOrderDetails(row);
          this.focusOrderId = null;
        }
      },
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load orders.');
        this.rows = [];
        this.nextCursor = null;
        this.isLoading = false;
      }
    });
  }

  loadMore(): void {
    if (!this.nextCursor || this.isLoadingMore) return;
    this.isLoadingMore = true;
    this.api.admin.orders(this.params(this.nextCursor)).subscribe({
      next: page => {
        const seen = new Set(this.rows.map(r => r.order.id));
        this.rows.push(...page.items.filter(o => !seen.has(o.id)).map(o => this.toRow(o)));
        this.nextCursor = page.nextCursor ?? null;
        this.isLoadingMore = false;
      },
      error: err => {
        this.toaster.showToast(apiErrorMessage(err, 'Could not load more orders.'), ToastType.Error, 4000);
        this.isLoadingMore = false;
      }
    });
  }

  private toRow(order: Order): OrderRow {
    return {
      order, showDetails: false, loadingDetail: false, newStatus: '', note: '',
      courier: order.shipment?.courier ?? '', awb: order.shipment?.awb ?? '', trackingUrl: order.shipment?.trackingUrl ?? '',
      busy: false,
    };
  }

  private replaceOrder(row: OrderRow, order: Order): void {
    row.order = order;
    row.newStatus = '';
    row.note = '';
    row.courier = order.shipment?.courier ?? row.courier;
    row.awb = order.shipment?.awb ?? row.awb;
    row.trackingUrl = order.shipment?.trackingUrl ?? row.trackingUrl;
  }

  refreshOrders(): void {
    this.loadOrders();
  }

  onSearchInput(): void {
    this.search$.next();
  }

  applyFilters(): void {
    this.loadOrders();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = '';
    this.selectedPaymentStatus = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.loadOrders();
  }

  // ---------- detail ----------

  toggleOrderDetails(row: OrderRow): void {
    row.showDetails = !row.showDetails;
    if (!row.showDetails) return;
    row.loadingDetail = true;
    this.api.admin.order(row.order.id).subscribe({
      next: o => { this.replaceOrder(row, o); row.loadingDetail = false; },
      error: () => { row.loadingDetail = false; }
    });
  }

  allowedStatuses(o: Order): OrderStatus[] {
    return NEXT_STATUS[o.status] ?? [];
  }

  updateStatus(row: OrderRow): void {
    const status = row.newStatus;
    if (!status) return;
    if (status === 'CANCELLED' && !confirm(`Cancel order ${row.order.id}? Stock will be released.`)) return;
    const body: { status: string; note?: string; courier?: string; awb?: string; trackingUrl?: string } = { status };
    if (row.note.trim()) body.note = row.note.trim();
    if (status === 'DISPATCHED') {
      if (row.courier.trim()) body.courier = row.courier.trim();
      if (row.awb.trim()) body.awb = row.awb.trim();
      if (row.trackingUrl.trim()) body.trackingUrl = row.trackingUrl.trim();
    }
    row.busy = true;
    this.api.admin.setOrderStatus(row.order.id, body).subscribe({
      next: o => {
        this.replaceOrder(row, o);
        row.busy = false;
        this.toaster.showToast(`Order ${o.id} is now ${this.statusLabel(o.status)}`, ToastType.Success, 3000);
      },
      error: err => {
        row.busy = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not update the order status.'), ToastType.Error, 5000);
      }
    });
  }

  /** Shiprocket is built but not configured for this store: its buttons/tracking stay hidden (Krishna, 13 Nov 2026). */
  readonly showShiprocket = false;

  canShip(o: Order): boolean {
    return this.showShiprocket && (o.status === 'PLACED' || o.status === 'CONFIRMED') && !o.shipment?.shipmentId;
  }

  sendToShippingProvider(row: OrderRow): void {
    row.busy = true;
    this.api.admin.shipOrder(row.order.id).subscribe({
      next: o => {
        this.replaceOrder(row, o);
        row.busy = false;
        this.toaster.showToast(`Shipment created${o.shipment?.shipmentId ? ': ' + o.shipment.shipmentId : ''}`, ToastType.Success, 5000);
      },
      error: err => {
        row.busy = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not send the order to Shiprocket.'), ToastType.Error, 6000);
      }
    });
  }

  loadTracking(row: OrderRow): void {
    row.loadingTracking = true;
    row.trackingError = '';
    this.api.admin.orderTracking(row.order.id).subscribe({
      next: res => {
        row.tracking = this.extractTracking(res?.tracking);
        row.loadingTracking = false;
      },
      error: err => {
        row.trackingError = apiErrorMessage(err, 'Tracking is not available.');
        row.loadingTracking = false;
      }
    });
  }

  /** Shiprocket answers either {tracking_data:{…}} or {"<shipmentId>":{tracking_data:{…}}}. */
  private extractTracking(raw: any): any {
    if (!raw) return null;
    if (raw.tracking_data) return raw.tracking_data;
    const first = Object.values(raw)[0] as any;
    return first?.tracking_data ?? raw;
  }

  markRefunded(row: OrderRow): void {
    if (!confirm(`Mark the refund for order ${row.order.id} as completed?`)) return;
    row.busy = true;
    this.api.admin.markRefunded(row.order.id, row.note.trim() || undefined).subscribe({
      next: o => {
        this.replaceOrder(row, o);
        row.busy = false;
        this.toaster.showToast('Refund marked as completed', ToastType.Success, 3000);
      },
      error: err => {
        row.busy = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not mark the refund.'), ToastType.Error, 5000);
      }
    });
  }

  // ---------- display helpers ----------

  statusLabel(s: OrderStatus | string): string {
    return ORDER_STATUS_LABEL[s as OrderStatus] ?? s;
  }

  paymentLabel(s: PaymentStatus | string): string {
    return PAYMENT_STATUS_LABEL[s as PaymentStatus] ?? s;
  }

  getPaymentStatusBadgeClass(s: PaymentStatus): string {
    switch (s) {
      case 'PAID': case 'COD_COLLECTED': return 'badge bg-success';
      case 'FAILED': return 'badge bg-danger';
      case 'REFUND_PENDING': return 'badge bg-info';
      case 'REFUNDED': return 'badge bg-secondary';
      default: return 'badge bg-warning';
    }
  }

  getStatusBadgeClass(s: OrderStatus): string {
    switch (s) {
      case 'DELIVERED': return 'badge bg-success';
      case 'DISPATCHED': return 'badge bg-info';
      case 'READY_TO_DISPATCH': case 'CONFIRMED': return 'badge bg-primary';
      case 'CANCELLED': case 'RETURNED': return 'badge bg-danger';
      case 'PENDING_PAYMENT': return 'badge bg-secondary';
      default: return 'badge bg-warning';
    }
  }

  getItemsCount(o: Order): number {
    return (o.lines || []).reduce((a, l) => a + (l.qty || 0), 0);
  }

  getFormattedAddress(o: Order): string {
    const a = o.shippingAddress;
    if (!a) return 'Address not available';
    return [a.line1, a.line2, a.landmark, a.city, a.state, a.pincode, a.country].filter(Boolean).join(', ');
  }

  countByPayment(...statuses: PaymentStatus[]): number {
    return this.rows.filter(r => statuses.includes(r.order.paymentStatus)).length;
  }

  countByStatus(...statuses: OrderStatus[]): number {
    return this.rows.filter(r => statuses.includes(r.order.status)).length;
  }

  // ---------- export & invoice ----------

  exportOrders(): void {
    if (this.rows.length === 0) {
      this.toaster.showToast('No orders to export', ToastType.Info, 3000);
      return;
    }
    const rupees = (p: number) => (p ?? 0) / 100;
    const data = this.rows.map(({ order: o }) => ({
      'Order ID': o.id,
      'Date': new Date(o.createdAt).toLocaleString('en-IN'),
      'Customer': o.customer?.name ?? '',
      'Phone': o.customer?.phone ?? '',
      'Email': o.customer?.email ?? '',
      'Status': this.statusLabel(o.status),
      'Payment Method': o.paymentMethod,
      'Payment Status': this.paymentLabel(o.paymentStatus),
      'Items': this.getItemsCount(o),
      'Subtotal (₹)': rupees(o.subtotalPaise),
      'Discount (₹)': rupees(o.discountPaise),
      'Coupon': o.couponCode ?? '',
      'Shipping (₹)': rupees(o.shippingPaise),
      'COD Fee (₹)': rupees(o.codFeePaise),
      'CGST (₹)': rupees(o.cgstPaise),
      'SGST (₹)': rupees(o.sgstPaise),
      'IGST (₹)': rupees(o.igstPaise),
      'Total (₹)': rupees(o.totalPaise),
      'City': o.shippingAddress?.city ?? '',
      'State': o.shippingAddress?.state ?? '',
      'Pincode': o.shippingAddress?.pincode ?? '',
      'Courier': o.shipment?.courier ?? '',
      'AWB': o.shipment?.awb ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /** Opens the GST tax invoice (issuing it if the order is confirmed but not yet invoiced); otherwise an order summary. */
  printInvoice(o: Order, download = false): void {
    const show = (html: string, number: string) => {
      if (download) downloadHtmlDocument(html, docFileName(number));
      else if (!printHtmlDocument(html)) this.toaster.showToast('Allow pop-ups to print the invoice', ToastType.Warn, 4000);
    };
    this.ops.orderInvoice(o.id).subscribe({
      next: v => show(v.html, v.invoice.number),
      error: err => {
        if (err?.status !== 404) {
          this.toaster.showToast(apiErrorMessage(err, 'Could not load the invoice.'), ToastType.Error, 4000);
        } else if (INVOICEABLE.includes(o.status)) {
          if (!window.confirm('This order has no tax invoice yet. Issue invoice now? (numbers are sequential and cannot be reused)')) return;
          this.ops.issueInvoice(o.id).subscribe({
            next: v => { o.invoiceNumber = v.invoice.number; o.invoiceDate = v.invoice.invoiceDate; show(v.html, v.invoice.number); },
            error: e => this.toaster.showToast(apiErrorMessage(e, 'Could not issue the invoice.'), ToastType.Error, 4000)
          });
        } else {
          this.toaster.showToast('A tax invoice is issued once the order is confirmed — printing an order summary instead.', ToastType.Info, 4000);
          this.printOrderSummary(o);
        }
      }
    });
  }

  /** Opens a printable order summary (not a tax invoice) in a new window. */
  printOrderSummary(o: Order): void {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => entities[c]);
    const m = (p: number) => esc(formatPaise(p));
    const a = o.shippingAddress || ({} as any);
    const lines = (o.lines || []).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}${l.variantName ? ' – ' + esc(l.variantName) : ''}<br><small>${esc(l.sku)}${l.hsn ? ' · HSN ' + esc(l.hsn) : ''}</small></td><td>${l.qty}</td><td>${m(l.unitPricePaise)}</td><td>${l.taxRatePercent ?? 0}%</td><td>${m(l.lineTotalPaise)}</td></tr>`).join('');
    const row = (label: string, p: number) => p ? `<tr><td colspan="5" class="r">${label}</td><td>${m(p)}</td></tr>` : '';
    const html = `<!DOCTYPE html><html><head><title>Order ${esc(o.id)}</title><style>
      body{font-family:Arial,sans-serif;font-size:13px;margin:24px;color:#222}table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #ccc;padding:6px;text-align:left}.r{text-align:right}h2{margin:0}</style></head><body>
      <h2>Order summary</h2><p>Order <b>${esc(o.id)}</b> · ${esc(new Date(o.createdAt).toLocaleString('en-IN'))}<br>
      Payment: ${esc(o.paymentMethod)} (${esc(this.paymentLabel(o.paymentStatus))})</p>
      <p><b>Ship to:</b><br>${esc(a.name)}<br>${esc(this.getFormattedAddress(o))}<br>${esc(a.phone)}${o.customer?.email ? ' · ' + esc(o.customer.email) : ''}</p>
      <table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit price</th><th>GST</th><th>Amount</th></tr></thead><tbody>${lines}
      ${row('Subtotal', o.subtotalPaise)}${o.discountPaise ? `<tr><td colspan="5" class="r">Discount${o.couponCode ? ' (' + esc(o.couponCode) + ')' : ''}</td><td>-${m(o.discountPaise)}</td></tr>` : ''}
      ${row('Shipping', o.shippingPaise)}${row('COD fee', o.codFeePaise)}${row('CGST', o.cgstPaise)}${row('SGST', o.sgstPaise)}${row('IGST', o.igstPaise)}
      <tr><td colspan="5" class="r"><b>Total${o.pricesIncludeTax ? ' (incl. GST)' : ''}</b></td><td><b>${m(o.totalPaise)}</b></td></tr></tbody></table>
      <script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      this.toaster.showToast('Allow pop-ups to print the invoice', ToastType.Warn, 4000);
      return;
    }
    w.document.write(html);
    w.document.close();
  }
}
