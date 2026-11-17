import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminOpsApi, COLLECTION_MODES, CodCollection, OutstandingCod } from '../../core/admin-ops-api';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { daysAgo, isoDate } from '@shared/core/print-doc';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { exportSheets, rs } from './ops-shared';
import { AdminApi } from '../../core/admin-api';
import { Order } from '@shared/core/models';

/** COD reconciliation: outstanding delivered COD orders, recording (partial) collections, collected list. */
@Component({
  selector: 'app-admin-collections',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  template: `
  <ul class="nav nav-tabs mb-3">
    <li class="nav-item"><button class="nav-link" [class.active]="tab === 'outstanding'" (click)="tab = 'outstanding'; loadOutstanding()">
      Outstanding <span class="badge bg-warning text-dark ms-1">{{ outstanding.length }}</span></button></li>
    <li class="nav-item"><button class="nav-link" [class.active]="tab === 'collected'" (click)="tab = 'collected'; loadCollected()">Collected</button></li>
  </ul>
  <div *ngIf="error" class="alert alert-danger">{{ error }}</div>

  <ng-container *ngIf="tab === 'outstanding'">
    <div class="d-flex align-items-center gap-3 mb-2">
      <div><span class="text-muted small">Total outstanding</span><div class="h5 mb-0">{{ outstandingPaise | money }}</div></div>
      <button class="btn btn-outline-primary ms-auto" (click)="exportOutstanding()" [disabled]="!outstanding.length"><i class="fas fa-file-excel me-1"></i>Excel</button>
      <button class="btn btn-primary" (click)="loadOutstanding()"><i class="fas fa-sync-alt"></i></button>
    </div>
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle">
        <thead><tr><th>Order</th><th>Customer</th><th>Delivered</th><th>Age</th><th>Courier / AWB</th><th class="text-end">Total</th>
          <th class="text-end">Collected</th><th class="text-end">Outstanding</th><th></th></tr></thead>
        <tbody>
          <ng-container *ngFor="let o of outstanding">
            <tr [class.table-danger]="o.ageDays > 14" [class.table-warning]="o.ageDays > 7 && o.ageDays <= 14">
              <td><code>{{ o.orderId }}</code></td>
              <td>{{ o.customerName }}<br><small class="text-muted">{{ o.customerPhone }} · {{ o.city }}</small></td>
              <td>{{ o.deliveredAt | date:'d MMM' }}</td>
              <td>{{ o.ageDays }} d</td>
              <td class="small">{{ o.courier }} {{ o.awb }}</td>
              <td class="text-end">{{ o.totalPaise | money }}</td>
              <td class="text-end">{{ o.collectedPaise | money }}</td>
              <td class="text-end fw-semibold">{{ o.outstandingPaise | money }}</td>
              <td class="text-end"><button class="btn btn-sm btn-success" (click)="startRecord(o)"><i class="fas fa-hand-holding-usd me-1"></i>Record</button></td>
            </tr>
            <tr *ngIf="recording?.orderId === o.orderId">
              <td colspan="9" class="bg-light">
                <div class="row g-2 align-items-end">
                  <div class="col-md-2"><label class="form-label small">Amount (₹)</label><input type="number" step="0.01" min="0.01" class="form-control form-control-sm" [(ngModel)]="form.amount"></div>
                  <div class="col-md-2"><label class="form-label small">Date</label><input type="date" class="form-control form-control-sm" [(ngModel)]="form.date" [max]="today"></div>
                  <div class="col-md-2"><label class="form-label small">Mode</label><select class="form-select form-select-sm" [(ngModel)]="form.mode">
                    <option *ngFor="let m of modes" [value]="m.id">{{ m.label }}</option></select></div>
                  <div class="col-md-2"><label class="form-label small">Reference</label><input class="form-control form-control-sm" [(ngModel)]="form.reference" placeholder="UTR / receipt"></div>
                  <div class="col-md-2"><label class="form-label small">Collected by</label><input class="form-control form-control-sm" [(ngModel)]="form.collectedBy" placeholder="Courier / staff"></div>
                  <div class="col-md-2"><label class="form-label small">Note</label><input class="form-control form-control-sm" [(ngModel)]="form.note"></div>
                  <div class="col-12 d-flex gap-2">
                    <button class="btn btn-sm btn-success" (click)="record()" [disabled]="busy">Save collection</button>
                    <button class="btn btn-sm btn-outline-secondary" (click)="recording = null">Cancel</button>
                    <span class="small text-muted align-self-center">Partial amounts are fine; the order is marked collected when the total is reached.</span>
                  </div>
                </div>
              </td>
            </tr>
          </ng-container>
          <tr *ngIf="!outstanding.length"><td colspan="9" class="text-center text-muted py-4">No outstanding COD — everything delivered has been collected.</td></tr>
        </tbody>
      </table>
    </div>
  </ng-container>

  <ng-container *ngIf="tab === 'collected'">
    <div class="row g-2 align-items-end mb-2">
      <div class="col-auto"><label class="form-label small">From</label><input type="date" class="form-control" [(ngModel)]="from" (change)="loadCollected()"></div>
      <div class="col-auto"><label class="form-label small">To</label><input type="date" class="form-control" [(ngModel)]="to" (change)="loadCollected()"></div>
      <div class="col-auto"><span class="text-muted small">Collected</span><div class="h5 mb-0">{{ collectedPaise | money }}</div></div>
      <div class="col-auto small" *ngFor="let m of byModeList()"><span class="badge bg-light text-dark">{{ m.label }}: {{ m.paise | money }}</span></div>
      <div class="col-auto ms-auto"><button class="btn btn-outline-primary" (click)="exportCollected()" [disabled]="!collected.length"><i class="fas fa-file-excel me-1"></i>Excel</button></div>
    </div>
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Mode</th><th>Reference</th><th>Collected by</th><th class="text-end">Amount</th><th></th></tr></thead>
        <tbody>
          <ng-container *ngFor="let c of collected">
          <tr class="coll-row" [class.open]="openId === c.id" [class.text-decoration-line-through]="c.voided" [class.text-muted]="c.voided"
              (click)="toggle(c)" title="Click to see the details">
            <td><i class="fas fa-fw text-muted me-1" [ngClass]="openId === c.id ? 'fa-chevron-down' : 'fa-chevron-right'"></i>{{ c.date | date:'d MMM y' }}</td><td><code>{{ c.orderId }}</code></td>
            <td>{{ c.customerName }}<br><small>{{ c.customerPhone }}</small></td>
            <td>{{ modeLabel(c.mode) }}</td><td>{{ c.reference }}</td><td>{{ c.collectedBy }}</td>
            <td class="text-end">{{ c.amountPaise | money }}</td>
            <td class="text-end"><span *ngIf="c.voided" class="badge bg-secondary" [title]="c.voidReason || ''">voided</span>
              <button *ngIf="!c.voided" class="btn btn-sm btn-link text-danger" (click)="$event.stopPropagation(); voidEntry(c)" title="Void a wrong entry"><i class="fas fa-ban"></i></button></td>
          </tr>
          <tr *ngIf="openId === c.id" class="coll-detail">
            <td colspan="8">
              <div *ngIf="detailLoading" class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary"></span></div>
              <div *ngIf="detailError" class="alert alert-warning py-2 mb-2 small">{{ detailError }}</div>
              <div class="row g-3" *ngIf="!detailLoading">
                <div class="col-lg-4">
                  <h6 class="small text-uppercase text-muted mb-2">This entry</h6>
                  <dl class="row small mb-0">
                    <dt class="col-5">Amount</dt><dd class="col-7">{{ c.amountPaise | money }}</dd>
                    <dt class="col-5">Collected on</dt><dd class="col-7">{{ c.date | date:'d MMM y' }}</dd>
                    <dt class="col-5">Mode</dt><dd class="col-7">{{ modeLabel(c.mode) }}</dd>
                    <dt class="col-5">Reference</dt><dd class="col-7">{{ c.reference || '—' }}</dd>
                    <dt class="col-5">Collected by</dt><dd class="col-7">{{ c.collectedBy || '—' }}</dd>
                    <dt class="col-5">Note</dt><dd class="col-7">{{ c.note || '—' }}</dd>
                    <dt class="col-5">Recorded</dt><dd class="col-7">{{ c.createdAt | date:'d MMM y, h:mm a' }}<span *ngIf="c.recordedBy"> by {{ c.recordedBy }}</span></dd>
                    <ng-container *ngIf="c.voided"><dt class="col-5 text-danger">Voided</dt><dd class="col-7 text-danger">{{ c.voidReason || 'yes' }}</dd></ng-container>
                  </dl>
                </div>
                <div class="col-lg-4" *ngIf="detailOrder as o">
                  <h6 class="small text-uppercase text-muted mb-2">Order {{ o.id }}</h6>
                  <table class="table table-sm small mb-2">
                    <tr *ngFor="let l of o.lines"><td>{{ l.name }}<span *ngIf="l.variantName" class="text-muted"> · {{ l.variantName }}</span></td>
                      <td class="text-end text-nowrap">{{ l.qty }} × {{ l.unitPricePaise | money }}</td></tr>
                    <tr class="fw-semibold"><td>Order total</td><td class="text-end">{{ o.totalPaise | money }}</td></tr>
                  </table>
                  <div class="small text-muted">{{ o.paymentMethod }} · {{ o.paymentStatus }} · {{ o.status }}</div>
                </div>
                <div class="col-lg-4">
                  <ng-container *ngIf="detailOrder?.shippingAddress as a">
                    <h6 class="small text-uppercase text-muted mb-2">Delivered to</h6>
                    <div class="small mb-3">{{ a.name }} · {{ a.phone }}<br>{{ a.line1 }}<span *ngIf="a.line2">, {{ a.line2 }}</span><br>{{ a.city }}, {{ a.state }} {{ a.pincode }}</div>
                  </ng-container>
                  <ng-container *ngIf="detailSummary as s">
                    <h6 class="small text-uppercase text-muted mb-2">All collections for this order</h6>
                    <div class="small" *ngFor="let e of s.items" [class.text-decoration-line-through]="e.voided">
                      {{ e.date | date:'d MMM' }} · {{ modeLabel(e.mode) }} · {{ e.amountPaise | money }}
                    </div>
                    <div class="small mt-1">Collected <strong>{{ s.collectedPaise | money }}</strong> of {{ s.totalPaise | money }}
                      <span *ngIf="s.outstandingPaise > 0" class="text-danger"> · {{ s.outstandingPaise | money }} outstanding</span>
                      <span *ngIf="s.outstandingPaise <= 0" class="text-success"> · fully collected</span></div>
                  </ng-container>
                </div>
              </div>
            </td>
          </tr>
          </ng-container>
          <tr *ngIf="!collected.length"><td colspan="8" class="text-center text-muted py-4">No collections recorded in this period.</td></tr>
        </tbody>
      </table>
    </div>
  </ng-container>
  `,
  styles: [`
    .coll-row { cursor: pointer; }
    .coll-row:hover td, .coll-row.open td { background: #f3f8fd; }
    .coll-detail > td { background: #f8fafc; border-top: 0; padding: 12px 16px; }
  `]
})
export class AdminCollectionsComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  private readonly admin = inject(AdminApi);
  private readonly toaster = inject(ToasterService);
  readonly modes = COLLECTION_MODES;
  readonly today = isoDate(new Date());

  tab: 'outstanding' | 'collected' = 'outstanding';
  outstanding: OutstandingCod[] = [];
  outstandingPaise = 0;
  collected: CodCollection[] = [];
  collectedPaise = 0;
  byMode: Record<string, number> = {};
  from = daysAgo(30);
  to = isoDate(new Date());
  error = '';
  busy = false;
  recording: OutstandingCod | null = null;
  form = { amount: 0, date: this.today, mode: 'cash', reference: '', collectedBy: '', note: '' };

  /** Collected tab: the row whose details are open, and what was loaded for it. */
  openId: string | null = null;
  detailOrder: Order | null = null;
  detailSummary: { totalPaise: number; collectedPaise: number; outstandingPaise: number; items: CodCollection[] } | null = null;
  detailLoading = false;
  detailError = '';

  ngOnInit(): void { this.loadOutstanding(); }

  toggle(c: CodCollection): void {
    if (this.openId === c.id) { this.openId = null; return; }
    this.openId = c.id;
    this.detailOrder = null;
    this.detailSummary = null;
    this.detailError = '';
    this.detailLoading = true;
    let pending = 2;
    const done = () => { if (--pending === 0) this.detailLoading = false; };
    this.admin.admin.order(c.orderId).subscribe({
      next: o => { if (this.openId === c.id) this.detailOrder = o; done(); },
      error: e => { this.detailError = apiErrorMessage(e, 'Could not load the order'); done(); }
    });
    this.ops.orderCollections(c.orderId).subscribe({
      next: s => { if (this.openId === c.id) this.detailSummary = s; done(); },
      error: () => done()
    });
  }

  modeLabel(m: string) { return this.modes.find(x => x.id === m)?.label ?? m; }
  byModeList() { return Object.entries(this.byMode).map(([k, v]) => ({ label: this.modeLabel(k), paise: v })); }

  loadOutstanding(): void {
    this.error = '';
    this.ops.outstandingCod().subscribe({
      next: r => { this.outstanding = r.items; this.outstandingPaise = r.outstandingPaise; },
      error: e => (this.error = apiErrorMessage(e))
    });
  }

  loadCollected(): void {
    this.error = '';
    this.ops.collections(this.from, this.to).subscribe({
      next: r => { this.openId = null; this.collected = r.items; this.collectedPaise = r.collectedPaise; this.byMode = r.byMode; },
      error: e => (this.error = apiErrorMessage(e))
    });
  }

  startRecord(o: OutstandingCod): void {
    this.recording = o;
    this.form = { amount: o.outstandingPaise / 100, date: this.today, mode: 'cash', reference: '', collectedBy: o.courier ?? '', note: '' };
  }

  record(): void {
    const o = this.recording;
    if (!o) return;
    const paise = Math.round(Number(this.form.amount) * 100);
    if (!(paise > 0)) { this.toaster.showToast('Enter an amount', ToastType.Warn); return; }
    if (paise > o.outstandingPaise) { this.toaster.showToast('Amount is more than what is outstanding', ToastType.Warn, 4000); return; }
    this.busy = true;
    this.ops.recordCollection(o.orderId, { amountPaise: paise, date: this.form.date, mode: this.form.mode, reference: this.form.reference || undefined,
      collectedBy: this.form.collectedBy || undefined, note: this.form.note || undefined }).subscribe({
      next: r => {
        this.busy = false;
        this.recording = null;
        this.toaster.showToast(r.order.paymentStatus === 'COD_COLLECTED' ? 'Fully collected' : 'Partial collection recorded', ToastType.Success);
        this.loadOutstanding();
      },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }

  voidEntry(c: CodCollection): void {
    const reason = window.prompt('Reason for voiding this collection entry?');
    if (!reason || !reason.trim() || !c.key) return;
    this.ops.voidCollection(c.key, reason.trim()).subscribe({
      next: () => { this.toaster.showToast('Entry voided', ToastType.Success); this.loadCollected(); this.loadOutstanding(); },
      error: e => this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000)
    });
  }

  exportOutstanding(): void {
    exportSheets(`cod-outstanding-${this.today}.xlsx`, [{ name: 'Outstanding COD', rows: this.outstanding.map(o => ({
      'Order ID': o.orderId, Customer: o.customerName ?? '', Phone: o.customerPhone ?? '', City: o.city ?? '', 'Order Date': o.orderDate?.slice(0, 10),
      Delivered: o.deliveredAt?.slice(0, 10) ?? '', 'Age (days)': o.ageDays, Courier: o.courier ?? '', AWB: o.awb ?? '',
      'Order Total': rs(o.totalPaise), Collected: rs(o.collectedPaise), Outstanding: rs(o.outstandingPaise),
    })) }]);
  }

  exportCollected(): void {
    exportSheets(`cod-collections-${this.from}-to-${this.to}.xlsx`, [{ name: 'Collections', rows: this.collected.map(c => ({
      Date: c.date, 'Order ID': c.orderId, Customer: c.customerName ?? '', Phone: c.customerPhone ?? '', Mode: this.modeLabel(c.mode),
      Reference: c.reference ?? '', 'Collected By': c.collectedBy ?? '', Amount: c.voided ? 0 : rs(c.amountPaise), Voided: c.voided ? 'yes' : '',
      'Void Reason': c.voidReason ?? '', Note: c.note ?? '',
    })) }]);
  }
}
