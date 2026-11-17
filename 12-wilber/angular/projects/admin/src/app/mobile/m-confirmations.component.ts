import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminOpsApi, ConfirmationItem } from '../core/admin-ops-api';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { telHref } from './m-common';

/** New orders waiting for a call-back: confirm one, several, or cancel with a reason. */
@Component({
  selector: 'app-m-confirmations',
  standalone: true,
  imports: [CommonModule, RouterModule, MoneyPipe],
  template: `
  <div class="m-page has-sticky">
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div class="m-list">
      <div *ngFor="let c of items" class="m-card" [class.selected]="picked.has(c.id)">
        <div class="m-card-top">
          <label class="m-check"><input type="checkbox" [checked]="picked.has(c.id)" (change)="toggle(c.id)">
            <b>{{ c.customerName || c.customerPhone }}</b></label>
          <b>{{ c.totalPaise | money }}</b>
        </div>
        <div class="m-card-sub">#{{ c.id }} · {{ c.ageMinutes < 60 ? c.ageMinutes + ' min' : (c.ageMinutes / 60 | number:'1.0-0') + ' h' }} ago
          · {{ c.city }} · {{ c.paymentMethod === 'cod' ? 'COD' : c.paymentMethod }}</div>
        <ul class="m-mini-lines"><li *ngFor="let i of c.items">{{ i.qty }} × {{ i.name }} <span>{{ i.variantName }}</span></li></ul>
        <div *ngIf="c.notes" class="m-note">{{ c.notes }}</div>
        <div class="m-btn-row">
          <a class="m-btn ghost" [href]="tel(c.customerPhone)"><i class="fas fa-phone"></i>Call</a>
          <a class="m-btn ghost" [routerLink]="['/m/orders', c.id]"><i class="fas fa-eye"></i>Open</a>
          <button class="m-btn danger-ghost" (click)="cancel(c)" [disabled]="busy"><i class="fas fa-times"></i>Cancel</button>
          <button class="m-btn primary" (click)="confirm([c.id])" [disabled]="busy"><i class="fas fa-check"></i>Confirm</button>
        </div>
      </div>
    </div>
    <div *ngIf="loading" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>
    <div *ngIf="!loading && !items.length && !error" class="m-empty"><i class="fas fa-check-circle"></i>All caught up — nothing to confirm.</div>

    <div class="m-sticky" *ngIf="picked.size">
      <button class="m-btn primary block" (click)="confirmPicked()" [disabled]="busy">Confirm {{ picked.size }} selected</button>
    </div>
  </div>
  `
})
export class MConfirmationsComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  private readonly toaster = inject(ToasterService);
  readonly tel = telHref;
  items: ConfirmationItem[] = [];
  picked = new Set<string>();
  loading = false;
  busy = false;
  error = '';

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.ops.confirmations().subscribe({
      next: r => { this.items = r.items; this.picked.clear(); this.loading = false; },
      error: e => { this.error = apiErrorMessage(e, 'Could not load pending orders'); this.loading = false; }
    });
  }

  confirmPicked(): void { this.confirm([...this.picked]); }

  toggle(id: string): void { this.picked.has(id) ? this.picked.delete(id) : this.picked.add(id); }

  confirm(ids: string[]): void {
    this.busy = true;
    this.ops.confirmOrders(ids).subscribe({
      next: r => {
        this.busy = false;
        this.toaster.showToast(r.failed ? `${r.confirmed} confirmed, ${r.failed} failed` : `${r.confirmed} confirmed`,
          r.failed ? ToastType.Warn : ToastType.Success, 3500);
        this.load();
      },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }

  cancel(c: ConfirmationItem): void {
    const reason = prompt(`Why cancel order #${c.id}?`);
    if (!reason?.trim()) return;
    this.busy = true;
    this.ops.cancelPending(c.id, reason.trim()).subscribe({
      next: () => { this.busy = false; this.toaster.showToast('Order cancelled', ToastType.Success); this.load(); },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}
