import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminApi } from '../core/admin-api';
import { AdminOpsApi } from '../core/admin-ops-api';
import { RolePermissionsService } from '../core/role-permissions.service';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { statusLabel, statusTone } from './m-common';

/** Today at a glance: sales, orders waiting for action, low stock, latest orders, quick actions. */
@Component({
  selector: 'app-m-home',
  standalone: true,
  imports: [CommonModule, RouterModule, MoneyPipe],
  template: `
  <div class="m-page">
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>

    <a *ngIf="ops.pendingCount() > 0" routerLink="/m/confirmations" class="m-callout">
      <i class="fas fa-user-check"></i>
      <div><strong>{{ ops.pendingCount() }} {{ ops.pendingCount() === 1 ? 'order needs' : 'orders need' }} confirming</strong>
        <small>Tap to review and confirm</small></div>
      <i class="fas fa-chevron-right ms-auto"></i>
    </a>

    <div class="m-kpis" *ngIf="d">
      <div class="m-kpi primary"><small>Today</small><b>{{ d.revenueTodayPaise | money }}</b><span>{{ d.ordersToday }} orders</span></div>
      <div class="m-kpi"><small>Last 30 days</small><b>{{ d.revenue30dPaise | money }}</b><span>{{ d.orders30d }} orders</span></div>
      <a class="m-kpi" routerLink="/m/orders" [queryParams]="{ status: 'PLACED' }"><small>To process</small>
        <b>{{ (d.ordersByStatus?.PLACED || 0) + (d.ordersByStatus?.CONFIRMED || 0) + (d.ordersByStatus?.READY_TO_DISPATCH || 0) }}</b>
        <span>placed · confirmed · ready</span></a>
      <a class="m-kpi" routerLink="/m/products" [queryParams]="{ stock: 'low' }"><small>Stock alerts</small>
        <b [class.text-danger]="outOfStock">{{ outOfStock }}</b><span>out of stock · {{ low }} low</span></a>
    </div>
    <div *ngIf="loading && !d" class="m-skeleton-grid"><div></div><div></div><div></div><div></div></div>

    <h2 class="m-h">Quick actions</h2>
    <div class="m-actions">
      <a routerLink="/m/new-order"><i class="fas fa-phone-alt"></i>Place order</a>
      <a routerLink="/m/categories"><i class="fas fa-plus-square"></i>Add product</a>
      <a routerLink="/m/customers"><i class="fas fa-users"></i>Customers</a>
      <a routerLink="/m/publish"><i class="fas fa-cloud-upload-alt"></i>Publish</a>
    </div>

    <ng-container *ngIf="d?.recentOrders?.length">
      <h2 class="m-h">Latest orders <a routerLink="/m/orders">See all</a></h2>
      <div class="m-list">
        <a *ngFor="let o of d.recentOrders" class="m-row" [routerLink]="['/m/orders', o.id]">
          <div class="m-row-main"><b>{{ o.customer || o.phone || 'Customer' }}</b>
            <small>#{{ o.id }} · {{ o.createdAt | date:'d MMM, h:mm a' }}</small></div>
          <div class="m-row-end"><b>{{ o.totalPaise | money }}</b><span class="m-pill" [ngClass]="tone(o.status)">{{ label(o.status) }}</span></div>
        </a>
      </div>
    </ng-container>

    <ng-container *ngIf="d?.lowStock?.length">
      <h2 class="m-h">Low stock</h2>
      <div class="m-list">
        <a *ngFor="let s of d.lowStock.slice(0, 8)" class="m-row" [routerLink]="['/m/products', s.productId]">
          <div class="m-row-main"><b>{{ s.name }}</b><small>{{ s.variantName }}</small></div>
          <div class="m-row-end"><span class="m-pill" [ngClass]="s.qty <= 0 ? 'bad' : 'warn'">{{ s.qty <= 0 ? 'Out' : s.qty + ' left' }}</span></div>
        </a>
      </div>
    </ng-container>
  </div>
  `
})
export class MHomeComponent implements OnInit {
  private readonly api = inject(AdminApi);
  readonly ops = inject(AdminOpsApi);
  private readonly roles = inject(RolePermissionsService);
  d: any = null;
  loading = false;
  error = '';
  readonly label = statusLabel;
  readonly tone = statusTone;

  get outOfStock(): number { return (this.d?.lowStock ?? []).filter((s: any) => s.qty <= 0).length; }
  get low(): number { return (this.d?.lowStock ?? []).filter((s: any) => s.qty > 0).length; }

  ngOnInit(): void {
    if (!this.roles.canAccessSection('', 'dashboard')) return;
    this.loading = true;
    this.api.admin.dashboard().subscribe({
      next: d => { this.d = d; this.loading = false; },
      error: e => { this.error = apiErrorMessage(e, 'Could not load the dashboard'); this.loading = false; }
    });
  }
}
