import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { AdminApi } from '../core/admin-api';
import { Order } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { paymentLabel, statusLabel, statusTone } from './m-common';

/** Orders: status chips, search, card list with "load more". */
@Component({
  selector: 'app-m-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MoneyPipe],
  template: `
  <div class="m-page">
    <div class="m-search">
      <i class="fas fa-search"></i>
      <input type="search" [(ngModel)]="q" (ngModelChange)="search$.next()" placeholder="Order no., name or phone" enterkeyhint="search">
    </div>
    <div class="m-chips">
      <button *ngFor="let s of statuses" [class.on]="status === s.id" (click)="setStatus(s.id)">{{ s.label }}</button>
    </div>

    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div class="m-list">
      <a *ngFor="let o of orders" class="m-card" [routerLink]="['/m/orders', o.id]">
        <div class="m-card-top">
          <b>{{ o.customer.name || o.shippingAddress.name || o.customer.phone }}</b>
          <b>{{ o.totalPaise | money }}</b>
        </div>
        <div class="m-card-sub">#{{ o.id }} · {{ o.createdAt | date:'d MMM, h:mm a' }} · {{ o.lines.length }} item{{ o.lines.length === 1 ? '' : 's' }}</div>
        <div class="m-card-tags">
          <span class="m-pill" [ngClass]="tone(o.status)">{{ label(o.status) }}</span>
          <span class="m-pill muted">{{ pay(o.paymentStatus) }}</span>
          <span *ngIf="o.shippingAddress.city" class="m-pill muted"><i class="fas fa-map-marker-alt me-1"></i>{{ o.shippingAddress.city }}</span>
        </div>
      </a>
    </div>
    <div *ngIf="loading" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>
    <div *ngIf="!loading && !orders.length && !error" class="m-empty"><i class="fas fa-receipt"></i>No orders here.</div>
    <button *ngIf="cursor && !loading" class="m-btn ghost block" (click)="load(true)">Load more</button>
  </div>
  `
})
export class MOrdersComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly label = statusLabel;
  readonly tone = statusTone;
  readonly pay = paymentLabel;
  readonly statuses = [
    { id: '', label: 'All' }, { id: 'PLACED', label: 'Placed' }, { id: 'CONFIRMED', label: 'Confirmed' },
    { id: 'READY_TO_DISPATCH', label: 'Ready' }, { id: 'DISPATCHED', label: 'Dispatched' }, { id: 'DELIVERED', label: 'Delivered' },
    { id: 'PENDING_PAYMENT', label: 'Awaiting payment' }, { id: 'CANCELLED', label: 'Cancelled' }, { id: 'RETURNED', label: 'Returned' },
  ];
  orders: Order[] = [];
  status = '';
  q = '';
  cursor: string | null = null;
  loading = false;
  error = '';
  readonly search$ = new Subject<void>();
  private sub?: Subscription;

  ngOnInit(): void {
    this.status = this.route.snapshot.queryParamMap.get('status') ?? '';
    this.sub = this.search$.pipe(debounceTime(350)).subscribe(() => this.load());
    this.load();
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  setStatus(s: string): void {
    this.status = s;
    this.router.navigate([], { queryParams: { status: s || null }, replaceUrl: true });
    this.load();
  }

  load(more = false): void {
    this.loading = true;
    this.error = '';
    this.api.admin.orders({ status: this.status, q: this.q.trim(), size: 20, cursor: more ? this.cursor ?? undefined : undefined }).subscribe({
      next: page => {
        this.orders = more ? [...this.orders, ...page.items.filter(o => !this.orders.some(x => x.id === o.id))] : page.items;
        this.cursor = page.nextCursor ?? null;
        this.loading = false;
      },
      error: e => { this.error = apiErrorMessage(e, 'Could not load orders'); this.loading = false; }
    });
  }
}
