import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AdminOpsApi } from '../../core/admin-ops-api';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { daysAgo, isoDate } from '@shared/core/print-doc';
import { exportSheets, rs } from './ops-shared';

type Tab = 'sales' | 'products' | 'categories' | 'gst';

/** Sales, product, category and GST reports for a date range, with Excel export. */
@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  template: `
  <div class="row g-2 align-items-end mb-3">
    <div class="col-auto"><label class="form-label small">From</label><input type="date" class="form-control" [(ngModel)]="from"></div>
    <div class="col-auto"><label class="form-label small">To</label><input type="date" class="form-control" [(ngModel)]="to"></div>
    <div class="col-auto" *ngIf="tab === 'sales'"><label class="form-label small">Group by</label>
      <select class="form-select" [(ngModel)]="groupBy"><option value="day">Day</option><option value="month">Month</option></select></div>
    <div class="col-auto d-flex gap-1">
      <button class="btn btn-outline-secondary btn-sm" (click)="preset('7')">7 days</button>
      <button class="btn btn-outline-secondary btn-sm" (click)="preset('month')">This month</button>
      <button class="btn btn-outline-secondary btn-sm" (click)="preset('lastmonth')">Last month</button>
      <button class="btn btn-outline-secondary btn-sm" (click)="preset('fy')">This FY</button>
    </div>
    <div class="col-auto"><button class="btn btn-primary" (click)="load()" [disabled]="loading"><i class="fas fa-play me-1"></i>Run</button></div>
    <div class="col-auto ms-auto"><button class="btn btn-outline-primary" (click)="exportAll()" [disabled]="!data"><i class="fas fa-file-excel me-1"></i>Export Excel</button></div>
  </div>
  <ul class="nav nav-tabs mb-3">
    <li class="nav-item" *ngFor="let t of tabs"><button class="nav-link" [class.active]="tab === t.id" (click)="tab = t.id; load()">{{ t.label }}</button></li>
  </ul>
  <div *ngIf="error" class="alert alert-danger">{{ error }}</div>
  <div *ngIf="loading" class="text-center py-4"><span class="spinner-border text-primary"></span></div>

  <ng-container *ngIf="!loading && data">
    <ng-container *ngIf="tab === 'sales'">
      <div class="row g-3 mb-3">
        <div class="col-md-2" *ngFor="let k of kpis"><div class="card"><div class="card-body py-2">
          <div class="small text-muted">{{ k.label }}</div><div class="h6 mb-0">{{ k.money ? (data.totals[k.key] | money) : data.totals[k.key] }}</div></div></div></div>
      </div>
      <div class="small text-muted mb-2">COD {{ data.totals.codOrders }} orders · {{ data.totals.codPaise | money }} &nbsp;|&nbsp;
        Online {{ data.totals.onlineOrders }} · {{ data.totals.onlinePaise | money }} &nbsp;|&nbsp; Offline {{ data.totals.offlineOrders }} · {{ data.totals.offlinePaise | money }}
        &nbsp;|&nbsp; Cancelled {{ data.totals.cancelledOrders }} ({{ data.totals.cancelledPaise | money }}) · Returned {{ data.totals.returnedOrders }} ({{ data.totals.returnedPaise | money }}) — excluded from sales</div>
      <div class="table-responsive"><table class="table table-sm table-striped">
        <thead><tr><th>{{ data.groupBy === 'month' ? 'Month' : 'Date' }}</th><th class="text-end">Orders</th><th class="text-end">Gross</th><th class="text-end">Discounts</th>
          <th class="text-end">Shipping</th><th class="text-end">COD fees</th><th class="text-end">GST</th><th class="text-end">Total</th><th class="text-end">Net (ex-GST)</th>
          <th class="text-end">COD</th><th class="text-end">Online</th><th class="text-end">Cancelled</th></tr></thead>
        <tbody><tr *ngFor="let r of data.rows" [class.text-muted]="!r.orders">
          <td>{{ r.period }}</td><td class="text-end">{{ r.orders }}</td><td class="text-end">{{ r.grossPaise | money }}</td><td class="text-end">{{ r.discountPaise | money }}</td>
          <td class="text-end">{{ r.shippingPaise | money }}</td><td class="text-end">{{ r.codFeePaise | money }}</td><td class="text-end">{{ r.taxPaise | money }}</td>
          <td class="text-end fw-semibold">{{ r.totalPaise | money }}</td><td class="text-end">{{ r.netPaise | money }}</td>
          <td class="text-end">{{ r.codPaise | money }}</td><td class="text-end">{{ r.onlinePaise + r.offlinePaise | money }}</td><td class="text-end">{{ r.cancelledOrders || '' }}</td></tr></tbody>
      </table></div>
    </ng-container>

    <ng-container *ngIf="tab === 'products' || tab === 'categories'">
      <div class="table-responsive"><table class="table table-sm table-striped">
        <thead><tr><th>{{ tab === 'products' ? 'Product' : 'Category' }}</th><th *ngIf="tab === 'products'">SKU</th><th class="text-end">Orders</th><th class="text-end">Qty</th>
          <th class="text-end">Gross</th><th class="text-end">Discounts</th><th class="text-end">Taxable</th><th class="text-end">GST</th><th class="text-end">Value</th></tr></thead>
        <tbody><tr *ngFor="let r of data.rows">
          <td>{{ tab === 'products' ? r.name + (r.variantName ? ' — ' + r.variantName : '') : r.category }}</td><td *ngIf="tab === 'products'" class="small">{{ r.sku }}</td>
          <td class="text-end">{{ r.orders }}</td><td class="text-end">{{ r.qty }}</td><td class="text-end">{{ r.grossPaise | money }}</td><td class="text-end">{{ r.discountPaise | money }}</td>
          <td class="text-end">{{ r.taxablePaise | money }}</td><td class="text-end">{{ r.taxPaise | money }}</td><td class="text-end fw-semibold">{{ r.totalPaise | money }}</td></tr>
          <tr *ngIf="!data.rows.length"><td colspan="9" class="text-center text-muted">No sales in this period.</td></tr></tbody>
      </table></div>
      <p class="small text-muted">Item value after discounts (shipping/COD fees excluded); cancelled, returned and unpaid orders excluded.
        <span *ngIf="tab === 'categories'">A product in several categories counts under its first category.</span></p>
    </ng-container>

    <ng-container *ngIf="tab === 'gst'">
      <p class="small text-muted">From tax invoices dated in the period (seller GSTIN {{ data.sellerGstin || '—' }}, {{ data.sellerState }}). Use with GSTR-1 / GSTR-3B.</p>
      <div class="row g-3 mb-3">
        <div class="col-md-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">Invoices</div><div class="h6 mb-0">{{ data.totals.invoices }}</div></div></div></div>
        <div class="col-md-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">Taxable</div><div class="h6 mb-0">{{ data.totals.taxablePaise | money }}</div></div></div></div>
        <div class="col-md-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">CGST</div><div class="h6 mb-0">{{ data.totals.cgstPaise | money }}</div></div></div></div>
        <div class="col-md-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">SGST</div><div class="h6 mb-0">{{ data.totals.sgstPaise | money }}</div></div></div></div>
        <div class="col-md-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">IGST</div><div class="h6 mb-0">{{ data.totals.igstPaise | money }}</div></div></div></div>
        <div class="col-md-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">Invoice value</div><div class="h6 mb-0">{{ data.totals.totalPaise | money }}</div></div></div></div>
      </div>
      <h6>By rate</h6>
      <table class="table table-sm"><thead><tr><th>Rate</th><th class="text-end">Taxable</th><th class="text-end">CGST</th><th class="text-end">SGST</th><th class="text-end">IGST</th><th class="text-end">Total tax</th></tr></thead>
        <tbody><tr *ngFor="let r of data.byRate"><td>{{ r.ratePercent }}%</td><td class="text-end">{{ r.taxablePaise | money }}</td><td class="text-end">{{ r.cgstPaise | money }}</td>
          <td class="text-end">{{ r.sgstPaise | money }}</td><td class="text-end">{{ r.igstPaise | money }}</td><td class="text-end">{{ r.taxPaise | money }}</td></tr></tbody></table>
      <div class="row">
        <div class="col-md-6"><h6>B2B / B2C</h6>
          <table class="table table-sm"><thead><tr><th></th><th class="text-end">Invoices</th><th class="text-end">Taxable</th><th class="text-end">Tax</th></tr></thead>
            <tbody><tr><td>B2B (buyer GSTIN)</td><td class="text-end">{{ data.b2b.invoices }}</td><td class="text-end">{{ data.b2b.taxablePaise | money }}</td><td class="text-end">{{ data.b2b.taxPaise | money }}</td></tr>
              <tr><td>B2C</td><td class="text-end">{{ data.b2c.invoices }}</td><td class="text-end">{{ data.b2c.taxablePaise | money }}</td><td class="text-end">{{ data.b2c.taxPaise | money }}</td></tr></tbody></table></div>
        <div class="col-md-6"><h6>B2C by place of supply</h6>
          <table class="table table-sm"><thead><tr><th>State</th><th class="text-end">Taxable</th><th class="text-end">Tax</th></tr></thead>
            <tbody><tr *ngFor="let r of data.b2cByPlaceOfSupply"><td>{{ r.placeOfSupply }}</td><td class="text-end">{{ r.taxablePaise | money }}</td><td class="text-end">{{ r.taxPaise | money }}</td></tr></tbody></table></div>
      </div>
      <h6>HSN summary</h6>
      <table class="table table-sm"><thead><tr><th>HSN/SAC</th><th>Rate</th><th class="text-end">Qty</th><th class="text-end">Taxable</th><th class="text-end">CGST</th><th class="text-end">SGST</th><th class="text-end">IGST</th></tr></thead>
        <tbody><tr *ngFor="let r of data.byHsn"><td>{{ r.hsn }}</td><td>{{ r.ratePercent }}%</td><td class="text-end">{{ r.qty }}</td><td class="text-end">{{ r.taxablePaise | money }}</td>
          <td class="text-end">{{ r.cgstPaise | money }}</td><td class="text-end">{{ r.sgstPaise | money }}</td><td class="text-end">{{ r.igstPaise | money }}</td></tr></tbody></table>
      <div *ngIf="data.creditNotesDue?.length" class="alert alert-warning small">
        {{ data.creditNotesDue.length }} invoice(s) in this period belong to orders cancelled/returned after invoicing — raise credit notes:
        {{ creditNoteNumbers() }}
      </div>
    </ng-container>
  </ng-container>
  `
})
export class AdminReportsComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'sales', label: 'Sales summary' }, { id: 'products', label: 'By product' }, { id: 'categories', label: 'By category' }, { id: 'gst', label: 'GST summary' },
  ];
  readonly kpis = [
    { key: 'orders', label: 'Orders', money: false }, { key: 'grossPaise', label: 'Gross', money: true }, { key: 'discountPaise', label: 'Discounts', money: true },
    { key: 'taxPaise', label: 'GST', money: true }, { key: 'totalPaise', label: 'Total sales', money: true }, { key: 'netPaise', label: 'Net (ex-GST)', money: true },
  ];

  tab: Tab = 'sales';
  from = daysAgo(29);
  to = isoDate(new Date());
  groupBy: 'day' | 'month' = 'day';
  data: any = null;
  loading = false;
  error = '';

  ngOnInit(): void { this.load(); }

  preset(p: string): void {
    const now = new Date();
    if (p === '7') { this.from = daysAgo(6); this.to = isoDate(now); }
    if (p === 'month') { this.from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1)); this.to = isoDate(now); }
    if (p === 'lastmonth') {
      this.from = isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      this.to = isoDate(new Date(now.getFullYear(), now.getMonth(), 0));
    }
    if (p === 'fy') { this.from = isoDate(new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1)); this.to = isoDate(now); this.groupBy = 'month'; }
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const req = this.tab === 'sales' ? this.ops.salesReport(this.from, this.to, this.groupBy)
      : this.tab === 'products' ? this.ops.productReport(this.from, this.to)
      : this.tab === 'categories' ? this.ops.categoryReport(this.from, this.to) : this.ops.gstReport(this.from, this.to);
    req.subscribe({
      next: d => { this.data = d; this.loading = false; },
      error: e => { this.error = apiErrorMessage(e, 'Could not run the report.'); this.data = null; this.loading = false; }
    });
  }

  creditNoteNumbers(): string { return (this.data?.creditNotesDue ?? []).map((i: any) => i.number).join(', '); }

  /** One workbook with every report for the period. */
  exportAll(): void {
    forkJoin({
      sales: this.ops.salesReport(this.from, this.to, this.groupBy), products: this.ops.productReport(this.from, this.to),
      categories: this.ops.categoryReport(this.from, this.to), gst: this.ops.gstReport(this.from, this.to),
    }).subscribe({
      next: ({ sales, products, categories, gst }) => {
        const salesRow = (r: any) => ({
          Period: r.period ?? 'TOTAL', Orders: r.orders, Gross: rs(r.grossPaise), Discounts: rs(r.discountPaise), Shipping: rs(r.shippingPaise),
          'COD Fees': rs(r.codFeePaise), GST: rs(r.taxPaise), Total: rs(r.totalPaise), 'Net (ex-GST)': rs(r.netPaise),
          'COD Orders': r.codOrders, COD: rs(r.codPaise), 'Online Orders': r.onlineOrders, Online: rs(r.onlinePaise),
          'Offline Orders': r.offlineOrders, Offline: rs(r.offlinePaise), 'Cancelled Orders': r.cancelledOrders, Cancelled: rs(r.cancelledPaise),
          'Returned Orders': r.returnedOrders, Returned: rs(r.returnedPaise),
        });
        const lineRow = (r: any, label: string) => ({
          [label]: label === 'Category' ? r.category : r.name, ...(label === 'Product' ? { Pack: r.variantName ?? '', SKU: r.sku ?? '', HSN: r.hsn ?? '' } : {}),
          Orders: r.orders, Qty: r.qty, Gross: rs(r.grossPaise), Discounts: rs(r.discountPaise), Taxable: rs(r.taxablePaise), GST: rs(r.taxPaise), Value: rs(r.totalPaise),
        });
        const tax = (r: any, extra: Record<string, unknown>) => ({ ...extra, Invoices: r.invoices, Qty: r.qty, Taxable: rs(r.taxablePaise), CGST: rs(r.cgstPaise),
          SGST: rs(r.sgstPaise), IGST: rs(r.igstPaise), 'Total Tax': rs(r.taxPaise), 'Invoice Value': rs(r.totalPaise) });
        exportSheets(`reports-${this.from}-to-${this.to}.xlsx`, [
          { name: 'Sales', rows: [...sales.rows.map(salesRow), salesRow(sales.totals)] },
          { name: 'Products', rows: products.rows.map((r: any) => lineRow(r, 'Product')) },
          { name: 'Categories', rows: categories.rows.map((r: any) => lineRow(r, 'Category')) },
          { name: 'GST by rate', rows: gst.byRate.map((r: any) => tax(r, { 'Rate %': r.ratePercent })) },
          { name: 'GST HSN summary', rows: gst.byHsn.map((r: any) => tax(r, { 'HSN/SAC': r.hsn, 'Rate %': r.ratePercent })) },
          { name: 'GST B2C by state', rows: gst.b2cByPlaceOfSupply.map((r: any) => tax(r, { 'Place of Supply': r.placeOfSupply })) },
          { name: 'GST B2B invoices', rows: gst.b2bInvoices.map((i: any) => ({ 'Invoice No': i.number, Date: i.invoiceDate, GSTIN: i.buyerGstin, Buyer: i.buyerName,
            'Place of Supply': i.placeOfSupply, Taxable: rs(i.taxablePaise), CGST: rs(i.cgstPaise), SGST: rs(i.sgstPaise), IGST: rs(i.igstPaise), Value: rs(i.totalPaise) })) },
          { name: 'Credit notes due', rows: gst.creditNotesDue.map((i: any) => ({ 'Invoice No': i.number, Date: i.invoiceDate, Status: i.status, Buyer: i.buyerName,
            Taxable: rs(i.taxablePaise), Tax: rs(i.taxPaise), Value: rs(i.totalPaise) })) },
        ]);
      },
      error: e => (this.error = apiErrorMessage(e, 'Export failed.'))
    });
  }
}
