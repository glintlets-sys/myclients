import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminOpsApi, ConfirmationItem } from '../../core/admin-ops-api';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { ageLabel, paymentMethodLabel } from './ops-shared';

/** Queue of newly placed orders waiting for staff confirmation (oldest first). */
@Component({
  selector: 'app-admin-confirmations',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  template: `
  <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
    <button class="btn btn-primary" (click)="load()" [disabled]="loading"><i class="fas fa-sync-alt me-1"></i>Refresh</button>
    <button class="btn btn-success" (click)="confirmSelected()" [disabled]="busy || selectedIds().length === 0">
      <i class="fas fa-check-double me-1"></i>Confirm selected ({{ selectedIds().length }})
    </button>
    <input class="form-control" style="max-width:320px" [(ngModel)]="note" placeholder="Note for confirmation (optional)">
    <span class="ms-auto text-muted small">{{ items.length }} awaiting confirmation</span>
  </div>
  <div *ngIf="error" class="alert alert-danger">{{ error }}</div>
  <div *ngIf="loading && !items.length" class="text-center py-4"><span class="spinner-border text-primary"></span></div>
  <div *ngIf="!loading && !items.length && !error" class="alert alert-success"><i class="fas fa-check-circle me-1"></i>No orders are waiting for confirmation.</div>

  <div class="table-responsive" *ngIf="items.length">
    <table class="table table-hover align-middle">
      <thead><tr>
        <th style="width:32px"><input type="checkbox" class="form-check-input" [checked]="allSelected()" (change)="toggleAll($event)"></th>
        <th>Order</th><th>Age</th><th>Customer</th><th>Items</th><th>Payment</th><th class="text-end">Total</th><th class="text-end">Actions</th>
      </tr></thead>
      <tbody>
        <tr *ngFor="let o of items" [class.table-warning]="o.ageMinutes > 24 * 60">
          <td><input type="checkbox" class="form-check-input" [(ngModel)]="selected[o.id]"></td>
          <td><code>{{ o.id }}</code><br><small class="text-muted">{{ o.createdAt | date:'d MMM, h:mm a' }}</small>
            <span *ngIf="o.channel !== 'WEB'" class="badge bg-info text-dark ms-1">{{ o.channel }}</span></td>
          <td><span class="badge" [class.bg-danger]="o.ageMinutes > 24*60" [class.bg-warning]="o.ageMinutes > 120 && o.ageMinutes <= 24*60"
                [class.text-dark]="o.ageMinutes <= 24*60" [class.bg-light]="o.ageMinutes <= 120">{{ age(o.ageMinutes) }}</span></td>
          <td>{{ o.customerName }}<br><small class="text-muted">{{ o.customerPhone }} · {{ o.city }}{{ o.state ? ', ' + o.state : '' }}</small></td>
          <td><div *ngFor="let l of o.items" class="small">{{ l.qty }} × {{ l.name }}<span *ngIf="l.variantName"> ({{ l.variantName }})</span></div>
            <div *ngIf="o.notes" class="small text-muted fst-italic">“{{ o.notes }}”</div></td>
          <td>{{ pm(o.paymentMethod) }}<br><small class="text-muted">{{ o.paymentStatus }}</small></td>
          <td class="text-end fw-semibold">{{ o.totalPaise | money }}</td>
          <td class="text-end text-nowrap">
            <button class="btn btn-sm btn-success me-1" (click)="confirmOne(o)" [disabled]="busy" title="Confirm"><i class="fas fa-check"></i></button>
            <button class="btn btn-sm btn-outline-danger" (click)="cancelling = o; cancelReason = ''" [disabled]="busy" title="Cancel"><i class="fas fa-times"></i></button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div *ngIf="cancelling" class="card border-danger mt-3" style="max-width:560px">
    <div class="card-body">
      <h6>Cancel order <code>{{ cancelling.id }}</code></h6>
      <p class="small text-muted mb-2">Stock is released and the customer is notified.</p>
      <input class="form-control mb-2" [(ngModel)]="cancelReason" placeholder="Reason (required, shown to the customer)" maxlength="300">
      <button class="btn btn-danger me-2" (click)="cancel()" [disabled]="busy || !cancelReason.trim()">Cancel order</button>
      <button class="btn btn-outline-secondary" (click)="cancelling = null">Back</button>
    </div>
  </div>
  `
})
export class AdminConfirmationsComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  private readonly toaster = inject(ToasterService);
  @Output() openOrder = new EventEmitter<string>();

  items: ConfirmationItem[] = [];
  selected: Record<string, boolean> = {};
  loading = false;
  busy = false;
  error = '';
  note = '';
  cancelling: ConfirmationItem | null = null;
  cancelReason = '';

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.error = '';
    this.ops.confirmations().subscribe({
      next: r => { this.items = r.items; this.selected = {}; this.loading = false; },
      error: e => { this.error = apiErrorMessage(e, 'Could not load the queue.'); this.loading = false; }
    });
  }

  age(m: number) { return ageLabel(m); }
  pm(m: string) { return paymentMethodLabel(m); }
  selectedIds(): string[] { return this.items.filter(o => this.selected[o.id]).map(o => o.id); }
  allSelected(): boolean { return this.items.length > 0 && this.items.every(o => this.selected[o.id]); }
  toggleAll(ev: Event): void {
    const on = (ev.target as HTMLInputElement).checked;
    this.items.forEach(o => (this.selected[o.id] = on));
  }

  confirmOne(o: ConfirmationItem): void { this.confirm([o.id]); }
  confirmSelected(): void { this.confirm(this.selectedIds()); }

  private confirm(ids: string[]): void {
    if (!ids.length) return;
    this.busy = true;
    this.ops.confirmOrders(ids, this.note.trim() || undefined).subscribe({
      next: r => {
        this.busy = false;
        const failed = r.results.filter(x => !x.ok);
        this.toaster.showToast(`Confirmed ${r.confirmed} order(s)` + (failed.length ? ` · ${failed.length} failed: ${failed.map(f => f.id + ' ' + (f.message ?? '')).join('; ')}` : ''),
          failed.length ? ToastType.Warn : ToastType.Success, failed.length ? 6000 : 3000);
        this.load();
      },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }

  cancel(): void {
    const o = this.cancelling;
    if (!o || !this.cancelReason.trim()) return;
    this.busy = true;
    this.ops.cancelPending(o.id, this.cancelReason.trim()).subscribe({
      next: () => { this.busy = false; this.cancelling = null; this.toaster.showToast('Order cancelled', ToastType.Success); this.load(); },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}
