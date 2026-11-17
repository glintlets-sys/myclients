import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { filter } from 'rxjs';
import { ApiService } from '@shared/core/api.service';
import { SessionService } from '@shared/core/session.service';
import { AdminOpsApi } from '../core/admin-ops-api';
import { RolePermissionsService } from '../core/role-permissions.service';
import { AdminCatalogApi } from '../core/admin-catalog-api';
import { setPreferredView } from './m-common';

/** Footer tabs. "New order" is the raised centre button. */
interface Tab { path: string; icon: string; label: string; section: string; center?: boolean; }

/**
 * Mobile admin shell: app bar on top, screen in the middle, icon tab bar fixed at the bottom (thumb reach).
 * Root screens (the tabs) show the store name; inner screens show a back arrow and their own title.
 */
@Component({
  selector: 'app-m-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
  <div class="m-app">
    <header class="m-bar">
      <button *ngIf="!isRoot" class="m-bar-btn" (click)="back()" aria-label="Back"><i class="fas fa-arrow-left"></i></button>
      <div class="m-bar-title">
        <span *ngIf="isRoot" class="m-bar-store"><i class="fas fa-store me-1"></i>{{ storeName || 'Store' }}</span>
        <span *ngIf="!isRoot">{{ title }}</span>
        <small *ngIf="isRoot">{{ title }}</small>
      </div>
      <a class="m-bar-btn" routerLink="/m/profile" aria-label="My profile"><i class="fas fa-user-circle"></i></a>
    </header>

    <main class="m-main"><router-outlet></router-outlet></main>

    <nav class="m-tabs" aria-label="Main">
      <ng-container *ngFor="let t of tabs">
        <a *ngIf="allowed(t)" [routerLink]="t.path" routerLinkActive="on" class="m-tab" [class.center]="t.center"
           [attr.aria-label]="t.label">
          <span class="m-tab-ico"><i class="fas" [ngClass]="t.icon"></i>
            <b *ngIf="t.section === 'orders' && ops.pendingCount() > 0" class="m-badge">{{ ops.pendingCount() }}</b></span>
          <span class="m-tab-label">{{ t.label }}</span>
        </a>
      </ng-container>
    </nav>
  </div>
  `
})
export class MShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly api = inject(ApiService);
  private readonly titleSvc = inject(Title);
  private readonly roles = inject(RolePermissionsService);
  private readonly catalogApi = inject(AdminCatalogApi);
  readonly session = inject(SessionService);
  readonly ops = inject(AdminOpsApi);

  readonly tabs: Tab[] = [
    { path: '/m/home', icon: 'fa-home', label: 'Home', section: 'dashboard' },
    { path: '/m/orders', icon: 'fa-receipt', label: 'Orders', section: 'orders' },
    { path: '/m/new-order', icon: 'fa-plus', label: 'New order', section: 'staff-order', center: true },
    { path: '/m/products', icon: 'fa-box', label: 'Products', section: 'products' },
    { path: '/m/more', icon: 'fa-th-large', label: 'More', section: 'profile' },
  ];

  storeName = '';
  title = '';
  isRoot = true;
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    setPreferredView('mobile');
    this.api.config().subscribe({ next: c => { this.storeName = c.store?.name ?? ''; this.setTitle(); }, error: () => {} });
    this.catalogApi.profile().subscribe({ error: () => {} });   // refresh permissions
    this.onRoute();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.onRoute());
    if (this.roles.canAccessSection('', 'confirmations')) {
      this.ops.refreshPendingCount();
      this.timer = setInterval(() => this.ops.refreshPendingCount(), 120_000);
    }
  }

  ngOnDestroy(): void { if (this.timer) clearInterval(this.timer); }

  allowed(t: Tab): boolean { return this.roles.canAccessSection('', t.section); }

  back(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/m/home']);
  }

  private onRoute(): void {
    let r = this.route.firstChild;
    while (r?.firstChild) r = r.firstChild;
    const data = r?.snapshot.data ?? {};
    this.title = data['title'] ?? '';
    this.isRoot = !!data['root'];
    this.setTitle();
    document.querySelector('.m-main')?.scrollTo?.(0, 0);
  }

  private setTitle(): void {
    this.titleSvc.setTitle(`${this.title ? this.title + ' · ' : ''}${this.storeName || 'Store'} admin`);
  }
}
