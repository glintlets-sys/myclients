import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AdminOpsApi, InvoiceSummary } from '../core/admin-ops-api';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { printHtmlDocument } from '@shared/core/print-doc';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { daysBack, isoDay } from './m-common';

const RANGES = [
  { id: 'today', label: 'Today', from: () => isoDay(new Date()) },
  { id: '7', label: '7 days', from: () => daysBack(6) },
  { id: '30', label: '30 days', from: () => daysBack(29) },
  { id: 'month', label: 'This month', from: () => { const d = new Date(); d.setDate(1); return isoDay(d); } },
];

/** Tax invoices for a period: totals on top, tap one to open / share the invoice. */
@Component({
  selector: 'app-m-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MoneyPipe],
  template: `
  <div class="m-page">
    <div class="m-chips"><button *ngFor="let r of ranges" [class.on]="range === r.id" (click)="setRange(r.id)">{{ r.label }}</button></div>
    <div class="m-search"><i class="fas fa-search"></i><input type="search" [(ngModel)]="q" (keyup.enter)="load()" placeholder="Invoice no. or buyer"></div>
    <div class="m-kpis" *ngIf="totals">
      <div class="m-kpi primary"><small>Invoiced</small><b>{{ totals.totalPaise | money }}</b><span>{{ totals.count }} invoices</span></div>
      <div class="m-kpi"><small>GST</small><b>{{ totals.taxPaise | money }}</b><span>taxable {{ totals.taxablePaise | money }}</span></div>
    </div>
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div *ngIf="loading" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>
    <div class="m-list">
      <button *ngFor="let i of items" class="m-row" (click)="open(i)">
        <div class="m-row-main"><b>{{ i.number }}</b><small>{{ i.buyerName || i.buyerPhone }} · {{ i.invoiceDate | date:'d MMM' }}</small></div>
        <div class="m-row-end"><b>{{ i.totalPaise | money }}</b><span class="m-pill muted">{{ i.status }}</span></div>
      </button>
    </div>
    <div *ngIf="!loading && !items.length && !error" class="m-empty"><i class="fas fa-file-invoice"></i>No invoices in this period.</div>
  </div>
  `
})
export class MInvoicesComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  private readonly toaster = inject(ToasterService);
  readonly ranges = RANGES;
  range = '30';
  q = '';
  items: InvoiceSummary[] = [];
  totals: { count: number; taxablePaise: number; taxPaise: number; totalPaise: number } | null = null;
  loading = false;
  error = '';

  ngOnInit(): void { this.load(); }
  setRange(id: string): void { this.range = id; this.load(); }

  load(): void {
    const from = RANGES.find(r => r.id === this.range)!.from();
    this.loading = true;
    this.error = '';
    this.ops.invoices({ from, to: isoDay(new Date()), q: this.q.trim() || undefined }).subscribe({
      next: r => { this.items = r.items; this.totals = r.totals; this.loading = false; },
      error: e => { this.error = apiErrorMessage(e, 'Could not load invoices'); this.loading = false; }
    });
  }

  open(i: InvoiceSummary): void {
    this.ops.orderInvoice(i.orderId).subscribe({
      next: v => { if (!printHtmlDocument(v.html, false)) this.toaster.showToast('Allow pop-ups to open the invoice', ToastType.Warn, 4000); },
      error: e => this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000)
    });
  }
}

/** Sales summary + best sellers for a period, as cards (the desktop Reports screen has the full tables and Excel). */
@Component({
  selector: 'app-m-reports',
  standalone: true,
  imports: [CommonModule, MoneyPipe],
  template: `
  <div class="m-page">
    <div class="m-chips"><button *ngFor="let r of ranges" [class.on]="range === r.id" (click)="setRange(r.id)">{{ r.label }}</button></div>
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div *ngIf="loading" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>
    <ng-container *ngIf="sales?.totals as t">
      <div class="m-kpis">
        <div class="m-kpi primary"><small>Sales</small><b>{{ t.totalPaise | money }}</b><span>{{ t.orders }} orders</span></div>
        <div class="m-kpi"><small>Net (after tax)</small><b>{{ t.netPaise | money }}</b><span>GST {{ t.taxPaise | money }}</span></div>
        <div class="m-kpi"><small>COD</small><b>{{ t.codPaise | money }}</b><span>{{ t.codOrders }} orders</span></div>
        <div class="m-kpi"><small>Online + offline</small><b>{{ (t.onlinePaise || 0) + (t.offlinePaise || 0) | money }}</b>
          <span>{{ (t.onlineOrders || 0) + (t.offlineOrders || 0) }} orders</span></div>
      </div>
      <div class="m-muted small mb-2" *ngIf="t.cancelledOrders || t.returnedOrders">
        Not counted: {{ t.cancelledOrders }} cancelled, {{ t.returnedOrders }} returned.</div>
    </ng-container>
    <ng-container *ngIf="top.length">
      <h2 class="m-h">Best sellers</h2>
      <div class="m-list">
        <div *ngFor="let r of top; let i = index" class="m-row">
          <span class="m-rank">{{ i + 1 }}</span>
          <div class="m-row-main"><b>{{ r.name }}</b><small>{{ r.variantName }} · {{ r.qty }} sold</small></div>
          <b>{{ r.totalPaise | money }}</b>
        </div>
      </div>
    </ng-container>
  </div>
  `
})
export class MReportsComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  readonly ranges = RANGES;
  range = '30';
  sales: any = null;
  top: any[] = [];
  loading = false;
  error = '';

  ngOnInit(): void { this.load(); }
  setRange(id: string): void { this.range = id; this.load(); }

  load(): void {
    const from = RANGES.find(r => r.id === this.range)!.from();
    const to = isoDay(new Date());
    this.loading = true;
    this.error = '';
    this.ops.salesReport(from, to, 'day').subscribe({
      next: r => { this.sales = r; this.loading = false; },
      error: e => { this.error = apiErrorMessage(e, 'Could not load the report'); this.loading = false; }
    });
    this.ops.productReport(from, to).subscribe({
      next: r => (this.top = [...(r.rows ?? [])].sort((a, b) => (b.totalPaise ?? 0) - (a.totalPaise ?? 0)).slice(0, 10)),
      error: () => (this.top = [])
    });
  }
}
