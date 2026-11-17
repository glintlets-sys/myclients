import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { AdminOpsApi, InvoiceSummary } from '../../core/admin-ops-api';
import { AdminApi } from '../../core/admin-api';
import { SessionService } from '@shared/core/session.service';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { daysAgo, docFileName, downloadHtmlDocument, isoDate, printHtmlDocument } from '@shared/core/print-doc';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { exportSheets, paymentMethodLabel, rs } from './ops-shared';

/** Tax invoices issued in a date range: search, print / download, Excel export, numbering settings. */
@Component({
  selector: 'app-admin-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  template: `
  <div class="row g-2 align-items-end mb-3">
    <div class="col-auto"><label class="form-label small">From</label><input type="date" class="form-control" [(ngModel)]="from" (change)="load()"></div>
    <div class="col-auto"><label class="form-label small">To</label><input type="date" class="form-control" [(ngModel)]="to" (change)="load()"></div>
    <div class="col-auto"><label class="form-label small">Status</label>
      <select class="form-select" [(ngModel)]="status" (change)="load()"><option value="">All</option><option value="ISSUED">Issued</option>
        <option value="CANCELLED">Cancelled (credit note due)</option><option value="RETURNED">Returned (credit note due)</option></select></div>
    <div class="col"><label class="form-label small">Search</label>
      <input class="form-control" [(ngModel)]="q" (ngModelChange)="search$.next()" placeholder="Invoice no., order id, name, phone, GSTIN"></div>
    <div class="col-auto d-flex gap-2">
      <button class="btn btn-outline-secondary" (click)="preset('month')">This month</button>
      <button class="btn btn-outline-secondary" (click)="preset('fy')">This FY</button>
      <button class="btn btn-outline-primary" (click)="exportExcel()" [disabled]="!items.length"><i class="fas fa-file-excel me-1"></i>Excel</button>
      <button class="btn btn-outline-dark" *ngIf="canSettings" (click)="showSettings = !showSettings" title="Numbering & footer"><i class="fas fa-cog"></i></button>
    </div>
  </div>

  <div *ngIf="showSettings" class="card mb-3"><div class="card-body">
    <h6>Invoice &amp; quotation settings</h6>
    <div class="row g-2">
      <div class="col-md-2"><label class="form-label small">Invoice prefix</label><input class="form-control form-control-sm" [(ngModel)]="cfg.invoicePrefix" maxlength="6"></div>
      <div class="col-md-2"><label class="form-label small">Quotation prefix</label><input class="form-control form-control-sm" [(ngModel)]="cfg.quotePrefix" maxlength="10"></div>
      <div class="col-md-2"><label class="form-label small">Quote validity (days)</label><input type="number" min="1" class="form-control form-control-sm" [(ngModel)]="cfg.quoteValidityDays"></div>
      <div class="col-md-2"><label class="form-label small">SAC for fees</label><input class="form-control form-control-sm" [(ngModel)]="cfg.feeSac" maxlength="8"></div>
      <div class="col-md-12"><label class="form-label small">Invoice footer (bank details, jurisdiction…)</label><textarea class="form-control form-control-sm" rows="2" [(ngModel)]="cfg.invoiceFooter"></textarea></div>
      <div class="col-md-12"><label class="form-label small">Default quotation terms</label><textarea class="form-control form-control-sm" rows="3" [(ngModel)]="cfg.quoteTerms"></textarea></div>
    </div>
    <div class="small text-muted mt-1">Invoice numbers look like <code>{{ (cfg.invoicePrefix || 'INV') }}/26-27/000123</code>; GST allows at most 16 characters, so keep the prefix to 3 letters.
      Numbers restart each financial year (April) and are never reused. Seller name, GSTIN, address and state come from Settings → Store.</div>
    <button class="btn btn-sm btn-primary mt-2" (click)="saveSettings()" [disabled]="savingSettings">Save</button>
  </div></div>

  <div class="row g-3 mb-3" *ngIf="totals">
    <div class="col-md-3"><div class="card"><div class="card-body py-2"><div class="small text-muted">Invoices</div><div class="h5 mb-0">{{ totals.count }}</div></div></div></div>
    <div class="col-md-3"><div class="card"><div class="card-body py-2"><div class="small text-muted">Taxable value (issued)</div><div class="h5 mb-0">{{ totals.taxablePaise | money }}</div></div></div></div>
    <div class="col-md-3"><div class="card"><div class="card-body py-2"><div class="small text-muted">GST (issued)</div><div class="h5 mb-0">{{ totals.taxPaise | money }}</div></div></div></div>
    <div class="col-md-3"><div class="card"><div class="card-body py-2"><div class="small text-muted">Invoice value (issued)</div><div class="h5 mb-0">{{ totals.totalPaise | money }}</div></div></div></div>
  </div>

  <div *ngIf="error" class="alert alert-danger">{{ error }}</div>
  <div *ngIf="loading" class="text-center py-3"><span class="spinner-border text-primary"></span></div>
  <div class="table-responsive" *ngIf="!loading">
    <table class="table table-sm table-hover align-middle">
      <thead><tr><th>Invoice</th><th>Date</th><th>Order</th><th>Buyer</th><th>Place of supply</th><th>Payment</th>
        <th class="text-end">Taxable</th><th class="text-end">GST</th><th class="text-end">Total</th><th></th></tr></thead>
      <tbody>
        <tr *ngFor="let i of items">
          <td><strong>{{ i.number }}</strong> <span *ngIf="i.status !== 'ISSUED'" class="badge bg-danger ms-1" title="Raise a credit note">{{ i.status }}</span></td>
          <td>{{ i.invoiceDate | date:'d MMM y' }}</td>
          <td><code>{{ i.orderId }}</code></td>
          <td>{{ i.buyerName }}<br><small class="text-muted">{{ i.buyerPhone }}<span *ngIf="i.buyerGstin"> · {{ i.buyerGstin }}</span></small></td>
          <td>{{ i.placeOfSupply }}</td>
          <td class="small">{{ pm(i.paymentMethod) }}</td>
          <td class="text-end">{{ i.taxablePaise | money }}</td>
          <td class="text-end">{{ i.taxPaise | money }}</td>
          <td class="text-end fw-semibold">{{ i.totalPaise | money }}</td>
          <td class="text-end text-nowrap">
            <button class="btn btn-sm btn-outline-primary me-1" (click)="print(i)" title="View / print"><i class="fas fa-print"></i></button>
            <button class="btn btn-sm btn-outline-secondary" (click)="download(i)" title="Download"><i class="fas fa-download"></i></button>
          </td>
        </tr>
        <tr *ngIf="!items.length"><td colspan="10" class="text-center text-muted py-4">No invoices in this period.</td></tr>
      </tbody>
    </table>
  </div>
  <p class="small text-muted">An order is invoiced when it is confirmed (or reaches a later fulfilment status). Use “Print → Save as PDF” for a PDF copy.</p>
  `
})
export class AdminInvoicesComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  private readonly api = inject(AdminApi);
  private readonly session = inject(SessionService);
  private readonly toaster = inject(ToasterService);

  from = daysAgo(30);
  to = isoDate(new Date());
  q = '';
  status = '';
  items: InvoiceSummary[] = [];
  totals: { count: number; taxablePaise: number; taxPaise: number; totalPaise: number } | null = null;
  loading = false;
  error = '';
  readonly search$ = new Subject<void>();

  readonly canSettings = this.session.can('settings');
  showSettings = false;
  savingSettings = false;
  cfg: any = {};

  ngOnInit(): void {
    this.search$.pipe(debounceTime(350)).subscribe(() => this.load());
    this.load();
    if (this.canSettings) this.api.admin.settings().subscribe({ next: s => (this.cfg = { ...(s?.invoicing ?? {}) }), error: () => {} });
  }

  pm(m: string) { return paymentMethodLabel(m); }

  preset(p: 'month' | 'fy'): void {
    const now = new Date();
    if (p === 'month') this.from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    else this.from = isoDate(new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1));
    this.to = isoDate(now);
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.ops.invoices({ from: this.from, to: this.to, q: this.q.trim(), status: this.status }).subscribe({
      next: r => { this.items = r.items; this.totals = r.totals; this.loading = false; },
      error: e => { this.error = apiErrorMessage(e, 'Could not load invoices.'); this.loading = false; }
    });
  }

  print(i: InvoiceSummary): void {
    this.ops.orderInvoice(i.orderId).subscribe({
      next: v => { if (!printHtmlDocument(v.html)) this.toaster.showToast('Allow pop-ups to print', ToastType.Warn, 4000); },
      error: e => this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000)
    });
  }

  download(i: InvoiceSummary): void {
    this.ops.orderInvoice(i.orderId).subscribe({
      next: v => downloadHtmlDocument(v.html, docFileName(v.invoice.number)),
      error: e => this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000)
    });
  }

  exportExcel(): void {
    exportSheets(`invoices-${this.from}-to-${this.to}.xlsx`, [{
      name: 'Invoices',
      rows: this.items.map(i => ({
        'Invoice No': i.number, 'Invoice Date': i.invoiceDate, Status: i.status, 'Order ID': i.orderId, Buyer: i.buyerName ?? '',
        Phone: i.buyerPhone ?? '', GSTIN: i.buyerGstin ?? '', 'Place of Supply': i.placeOfSupply ?? '', Payment: this.pm(i.paymentMethod),
        'Taxable Value': rs(i.taxablePaise), CGST: rs(i.cgstPaise), SGST: rs(i.sgstPaise), IGST: rs(i.igstPaise), 'Total GST': rs(i.taxPaise),
        'Invoice Value': rs(i.totalPaise),
      })),
    }]);
  }

  saveSettings(): void {
    const prefix = String(this.cfg.invoicePrefix ?? '').trim().toUpperCase();
    if (prefix.length > 3) this.toaster.showToast('Prefixes longer than 3 letters shorten the serial to keep invoice numbers ≤ 16 characters', ToastType.Warn, 5000);
    this.savingSettings = true;
    const invoicing = { ...this.cfg, invoicePrefix: prefix || 'INV', quoteValidityDays: Math.max(1, Number(this.cfg.quoteValidityDays) || 15) };
    this.api.admin.saveSettings({ invoicing }).subscribe({
      next: s => { this.cfg = { ...(s?.invoicing ?? {}) }; this.savingSettings = false; this.toaster.showToast('Saved', ToastType.Success); },
      error: e => { this.savingSettings = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}
