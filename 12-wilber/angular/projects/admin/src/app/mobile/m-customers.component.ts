import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { AdminApi } from '../core/admin-api';
import { Address, Order, User } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { statusLabel, statusTone, telHref, waHref } from './m-common';

/** Customer search; tap for contact buttons, addresses and order history. */
@Component({
  selector: 'app-m-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
  <div class="m-page">
    <div class="m-search"><i class="fas fa-search"></i>
      <input type="search" [(ngModel)]="q" (ngModelChange)="search$.next()" placeholder="Name, phone or email"></div>
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div class="m-list">
      <a *ngFor="let c of items" class="m-row" [routerLink]="['/m/customers', c.id]">
        <span class="m-avatar">{{ (c.name || c.phone || '?').charAt(0) | uppercase }}</span>
        <div class="m-row-main"><b>{{ c.name || 'No name' }}</b><small>{{ c.phone }}<span *ngIf="c.email"> · {{ c.email }}</span></small></div>
        <span *ngIf="c.status === 'BLOCKED'" class="m-pill bad">Blocked</span>
        <i class="fas fa-chevron-right m-chev"></i>
      </a>
    </div>
    <div *ngIf="loading" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>
    <div *ngIf="!loading && !items.length && !error" class="m-empty"><i class="fas fa-users"></i>No customers found.</div>
    <button *ngIf="cursor && !loading" class="m-btn ghost block" (click)="load(true)">Load more</button>
  </div>
  `
})
export class MCustomersComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);
  items: User[] = [];
  q = '';
  cursor: string | null = null;
  loading = false;
  error = '';
  readonly search$ = new Subject<void>();
  private sub?: Subscription;

  ngOnInit(): void { this.sub = this.search$.pipe(debounceTime(350)).subscribe(() => this.load()); this.load(); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  load(more = false): void {
    this.loading = true;
    this.api.admin.customers({ q: this.q.trim(), size: 30, cursor: more ? this.cursor ?? undefined : undefined }).subscribe({
      next: p => { this.items = more ? [...this.items, ...p.items] : p.items; this.cursor = p.nextCursor ?? null; this.loading = false; },
      error: e => { this.error = apiErrorMessage(e, 'Could not load customers'); this.loading = false; }
    });
  }
}

@Component({
  selector: 'app-m-customer',
  standalone: true,
  imports: [CommonModule, RouterModule, MoneyPipe],
  template: `
  <div class="m-page" *ngIf="c; else loadingTpl">
    <section class="m-sheet m-center">
      <span class="m-avatar xl">{{ (c.name || c.phone || '?').charAt(0) | uppercase }}</span>
      <h2 class="m-title">{{ c.name || 'No name' }}</h2>
      <div class="m-muted">{{ c.phone }}<span *ngIf="c.email"> · {{ c.email }}</span></div>
      <div class="m-muted small">Customer since {{ c.createdAt | date:'d MMM y' }}</div>
      <div class="m-btn-row mt-3">
        <a class="m-btn ghost" [href]="tel(c.phone)"><i class="fas fa-phone"></i>Call</a>
        <a class="m-btn ghost" [href]="wa(c.phone)" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i>WhatsApp</a>
        <a class="m-btn primary" routerLink="/m/new-order"><i class="fas fa-plus"></i>Order</a>
      </div>
    </section>
    <ng-container *ngIf="c.addresses?.length">
      <h2 class="m-h">Addresses</h2>
      <section class="m-sheet" *ngFor="let a of c.addresses">
        <b>{{ a.name }}</b> <span *ngIf="a.isDefault" class="m-pill ok">Default</span>
        <div class="m-muted">{{ a.line1 }}<span *ngIf="a.line2">, {{ a.line2 }}</span>, {{ a.city }}, {{ a.state }} {{ a.pincode }}</div>
        <div *ngIf="a.gstin" class="m-muted small">GSTIN {{ a.gstin }}</div>
      </section>
    </ng-container>
    <h2 class="m-h">Orders ({{ c.orders?.length || 0 }})</h2>
    <div class="m-list">
      <a *ngFor="let o of c.orders" class="m-row" [routerLink]="['/m/orders', o.id]">
        <div class="m-row-main"><b>#{{ o.id }}</b><small>{{ o.createdAt | date:'d MMM y' }}</small></div>
        <div class="m-row-end"><b>{{ o.totalPaise | money }}</b><span class="m-pill" [ngClass]="tone(o.status)">{{ label(o.status) }}</span></div>
      </a>
    </div>
  </div>
  <ng-template #loadingTpl><div class="m-page"><div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div *ngIf="!error" class="m-loading"><span class="spinner-border"></span></div></div></ng-template>
  `
})
export class MCustomerComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  readonly tel = telHref;
  readonly wa = waHref;
  readonly label = statusLabel;
  readonly tone = statusTone;
  c: (User & { addresses?: Address[]; orders?: Order[] }) | null = null;
  error = '';

  ngOnInit(): void {
    this.api.admin.customer(this.route.snapshot.paramMap.get('id') ?? '').subscribe({
      next: d => (this.c = d),
      error: e => (this.error = apiErrorMessage(e, 'Could not load the customer'))
    });
  }
}
