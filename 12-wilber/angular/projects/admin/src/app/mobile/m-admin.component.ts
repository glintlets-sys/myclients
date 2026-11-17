import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AdminApi } from '../core/admin-api';
import { AccessMatrix, AdminCatalogApi, Profile } from '../core/admin-catalog-api';
import { RolePermissionsService, STAFF_ROLES } from '../core/role-permissions.service';
import { SettingsStore, toPaise, toRupees } from '../admin/admin-settings/settings-store.service';
import { ApiService } from '@shared/core/api.service';
import { SessionService } from '@shared/core/session.service';
import { User } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { environment } from '../../environments/environment';
import { openDesktop, telHref } from './m-common';

interface MenuItem { path: string; icon: string; label: string; section: string; }

/** "More" tab: every other screen as a big icon grid, plus desktop view, install app and sign out. */
@Component({
  selector: 'app-m-more',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
  <div class="m-page">
    <ng-container *ngFor="let g of groups">
      <h2 class="m-h">{{ g.title }}</h2>
      <div class="m-grid">
        <ng-container *ngFor="let i of g.items">
          <a *ngIf="can(i.section)" [routerLink]="i.path" class="m-grid-item"><i class="fas" [ngClass]="i.icon"></i><span>{{ i.label }}</span></a>
        </ng-container>
      </div>
    </ng-container>

    <h2 class="m-h">App</h2>
    <div class="m-list">
      <button *ngIf="installPrompt" class="m-row" (click)="install()"><i class="fas fa-download m-row-ico"></i><div class="m-row-main"><b>Install on this phone</b>
        <small>Opens like an app from the home screen</small></div></button>
      <div *ngIf="!installPrompt && isIos" class="m-row"><i class="fas fa-mobile-alt m-row-ico"></i><div class="m-row-main"><b>Install on iPhone</b>
        <small>Tap Share <i class="fas fa-share-square"></i> → "Add to Home Screen"</small></div></div>
      <a *ngIf="storefront" class="m-row" [href]="storefront" target="_blank" rel="noopener"><i class="fas fa-external-link-alt m-row-ico"></i>
        <div class="m-row-main"><b>View website</b></div></a>
      <button class="m-row" (click)="desktop()"><i class="fas fa-desktop m-row-ico"></i><div class="m-row-main"><b>Desktop view</b>
        <small>Full screens: quotations, COD, audit, Excel import/export…</small></div></button>
      <button class="m-row text-danger" (click)="signOut()"><i class="fas fa-sign-out-alt m-row-ico"></i><div class="m-row-main"><b>Sign out</b></div></button>
    </div>
  </div>
  `
})
export class MMoreComponent implements OnInit {
  private readonly roles = inject(RolePermissionsService);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly storefront = environment.storefrontUrl;
  readonly isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  installPrompt: any = (window as any).__glintInstallPrompt ?? null;

  readonly groups: { title: string; items: MenuItem[] }[] = [
    { title: 'Sales', items: [
      { path: '/m/orders', icon: 'fa-receipt', label: 'Orders', section: 'orders' },
      { path: '/m/confirmations', icon: 'fa-user-check', label: 'Confirm orders', section: 'confirmations' },
      { path: '/m/new-order', icon: 'fa-phone-alt', label: 'Place order', section: 'staff-order' },
      { path: '/m/invoices', icon: 'fa-file-invoice', label: 'Invoices', section: 'invoices' },
      { path: '/m/reports', icon: 'fa-chart-pie', label: 'Reports', section: 'reports' },
      { path: '/m/customers', icon: 'fa-users', label: 'Customers', section: 'customers' },
    ] },
    { title: 'Catalogue', items: [
      { path: '/m/products', icon: 'fa-box', label: 'Products', section: 'products' },
      { path: '/m/categories', icon: 'fa-tags', label: 'Categories', section: 'categories' },
      { path: '/m/recommendations', icon: 'fa-thumbs-up', label: 'Recommend', section: 'recommendations' },
      { path: '/m/publish', icon: 'fa-cloud-upload-alt', label: 'Publish', section: 'seo' },
    ] },
    { title: 'Website', items: [
      { path: '/m/banners', icon: 'fa-images', label: 'Banners', section: 'banners' },
      { path: '/m/blogs', icon: 'fa-blog', label: 'Blogs', section: 'blogs' },
    ] },
    { title: 'Admin', items: [
      { path: '/m/settings', icon: 'fa-cog', label: 'Settings', section: 'settings' },
      { path: '/m/users', icon: 'fa-users-cog', label: 'Staff', section: 'admin-users' },
      { path: '/m/access', icon: 'fa-user-lock', label: 'Access', section: 'access-control' },
      { path: '/m/profile', icon: 'fa-id-badge', label: 'My profile', section: 'profile' },
    ] },
  ];

  ngOnInit(): void {
    window.addEventListener('glint-install-ready', () => (this.installPrompt = (window as any).__glintInstallPrompt));
  }

  can(section: string): boolean { return this.roles.canAccessSection('', section); }

  async install(): Promise<void> {
    const p = this.installPrompt;
    if (!p) return;
    p.prompt();
    await p.userChoice;
    this.installPrompt = (window as any).__glintInstallPrompt = null;
  }

  desktop(): void { openDesktop('dashboard'); }

  signOut(): void {
    const done = () => { this.session.clear(); this.router.navigate(['/login']); };
    this.api.logout().subscribe({ next: done, error: done });
  }
}

/** Store details, delivery charges and the out-of-stock rule — the settings staff change from a phone. */
@Component({
  selector: 'app-m-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [SettingsStore],
  template: `
  <div class="m-page has-sticky">
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div *ngIf="loading" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>
    <ng-container *ngIf="!loading && store">
      <section class="m-sheet">
        <h3 class="m-sheet-h">Store</h3>
        <label class="m-label">Store name</label><input class="m-input" [(ngModel)]="store.name">
        <label class="m-label">Support phone</label><input class="m-input" type="tel" [(ngModel)]="store.supportPhone">
        <label class="m-label">WhatsApp</label><input class="m-input" type="tel" [(ngModel)]="store.whatsapp">
        <label class="m-label">Support email</label><input class="m-input" type="email" [(ngModel)]="store.supportEmail">
        <label class="m-label">Address</label><textarea class="m-input" rows="3" [(ngModel)]="store.address"></textarea>
      </section>
      <section class="m-sheet">
        <h3 class="m-sheet-h">Delivery charges</h3>
        <div class="m-inline">
          <div><label class="m-label">Flat fee (₹)</label><input class="m-input" type="number" inputmode="decimal" [(ngModel)]="flatFee"></div>
          <div><label class="m-label">Free above (₹)</label><input class="m-input" type="number" inputmode="decimal" [(ngModel)]="freeAbove"></div>
        </div>
      </section>
      <section class="m-sheet">
        <label class="m-switch"><input type="checkbox" [(ngModel)]="hideOutOfStock"><span></span>
          <b>Hide out-of-stock products from the website</b></label>
      </section>
      <p class="m-hint">Payments, SMS, email, tax and coupons are set on the desktop view.</p>
      <div class="m-sticky"><button class="m-btn primary block" (click)="save()" [disabled]="saving">Save settings</button></div>
    </ng-container>
  </div>
  `
})
export class MSettingsComponent implements OnInit {
  private readonly settings = inject(SettingsStore);
  private readonly catalogApi = inject(AdminCatalogApi);
  private readonly toaster = inject(ToasterService);
  store: any = null;
  private shipping: any = {};
  flatFee = 0;
  freeAbove = 0;
  hideOutOfStock = false;
  private hideOutOfStockWas = false;
  loading = false;
  saving = false;
  error = '';

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      await this.settings.load();
      this.store = this.settings.section('store');
      this.shipping = this.settings.section('shipping');
      this.flatFee = toRupees(this.shipping.flatFeePaise);
      this.freeAbove = toRupees(this.shipping.freeAbovePaise);
    } catch (e) { this.error = apiErrorMessage(e, 'Could not load settings'); }
    this.catalogApi.catalogSettings().subscribe({ next: s => (this.hideOutOfStock = this.hideOutOfStockWas = !!s.hideOutOfStock), error: () => {} });
    this.loading = false;
  }

  async save(): Promise<void> {
    this.saving = true;
    try {
      await this.settings.save({
        store: this.store,
        shipping: { ...this.shipping, flatFeePaise: toPaise(this.flatFee), freeAbovePaise: toPaise(this.freeAbove) },
      });
      if (this.hideOutOfStock !== this.hideOutOfStockWas) {
        await new Promise((res, rej) => this.catalogApi.saveCatalogSettings({ hideOutOfStock: this.hideOutOfStock }).subscribe({ next: res, error: rej }));
        this.hideOutOfStockWas = this.hideOutOfStock;
      }
      this.toaster.showToast('Settings saved', ToastType.Success);
    } catch (e) { this.toaster.showToast(apiErrorMessage(e, 'Could not save'), ToastType.Error, 4000); }
    this.saving = false;
  }
}

/** Staff list: call, change role, block/unblock; add a staff member by mobile number. */
@Component({
  selector: 'app-m-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="m-page">
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div class="m-list">
      <div *ngFor="let u of users" class="m-card" [class.dim]="u.status === 'BLOCKED'">
        <div class="m-card-top"><div><b>{{ u.name || u.phone }}</b><small class="d-block m-muted">{{ u.phone }}<span *ngIf="u.email"> · {{ u.email }}</span></small></div>
          <a class="m-icon-btn" [href]="tel(u.phone)" aria-label="Call"><i class="fas fa-phone"></i></a></div>
        <div class="m-inline mt-2">
          <select class="m-input" [ngModel]="u.role" (ngModelChange)="setRole(u, $event)">
            <option *ngFor="let r of roles" [value]="r">{{ roleName(r) }}</option></select>
          <button class="m-btn" [ngClass]="u.status === 'BLOCKED' ? 'ghost' : 'danger-ghost'" (click)="toggleBlock(u)">
            {{ u.status === 'BLOCKED' ? 'Unblock' : 'Block' }}</button>
        </div>
      </div>
    </div>
    <h2 class="m-h">Add staff</h2>
    <section class="m-sheet">
      <input class="m-input" type="tel" inputmode="numeric" maxlength="10" [(ngModel)]="nu.phone" placeholder="Mobile (10 digits) — they sign in with OTP">
      <input class="m-input mt-2" [(ngModel)]="nu.name" placeholder="Name">
      <select class="m-input mt-2" [(ngModel)]="nu.role"><option *ngFor="let r of roles" [value]="r">{{ roleName(r) }}</option></select>
      <button class="m-btn primary block mt-2" (click)="addUser()" [disabled]="busy">Add staff member</button>
    </section>
  </div>
  `
})
export class MUsersComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly perms = inject(RolePermissionsService);
  private readonly toaster = inject(ToasterService);
  readonly tel = telHref;
  readonly roles = [...STAFF_ROLES];
  users: User[] = [];
  nu = { phone: '', name: '', role: 'STORE_MANAGER' };
  busy = false;
  error = '';

  ngOnInit(): void { this.load(); }
  roleName(r: string): string { return this.perms.getRoleDisplayName(r); }

  load(): void {
    this.api.admin.staff().subscribe({ next: r => (this.users = r.users), error: e => (this.error = apiErrorMessage(e, 'Could not load staff')) });
  }

  setRole(u: User, role: string): void {
    if (!confirm(`Make ${u.name || u.phone} a ${this.roleName(role)}?`)) { this.load(); return; }
    this.api.admin.setStaff({ phone: u.phone, role, name: u.name, email: u.email }).subscribe({
      next: () => { this.toaster.showToast('Role changed', ToastType.Success); this.load(); },
      error: e => { this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); this.load(); }
    });
  }

  toggleBlock(u: User): void {
    const next = u.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';
    if (next === 'BLOCKED' && !confirm(`Block ${u.name || u.phone}? They are signed out and cannot log in.`)) return;
    this.api.admin.setUserStatus(u.id, next).subscribe({
      next: s => Object.assign(u, s),
      error: e => this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000)
    });
  }

  addUser(): void {
    const phone = this.nu.phone.replace(/\D/g, '');
    if (phone.length !== 10) { this.toaster.showToast('Enter a 10-digit mobile number', ToastType.Warn); return; }
    this.busy = true;
    this.api.admin.setStaff({ phone, role: this.nu.role, name: this.nu.name.trim() || undefined }).subscribe({
      next: () => { this.busy = false; this.nu = { phone: '', name: '', role: 'STORE_MANAGER' }; this.toaster.showToast('Staff added', ToastType.Success); this.load(); },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}

/** What each role may do: one card per role, a switch per permission. */
@Component({
  selector: 'app-m-access',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="m-page">
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <ng-container *ngIf="m">
      <details *ngFor="let r of m.roles" class="m-acc" [open]="open === r.role" (toggle)="open = r.role">
        <summary><b>{{ roleName(r.role) }}</b> <small class="m-muted">{{ r.permissions.length }} permissions<span *ngIf="r.overridden"> · customised</span></small></summary>
        <label *ngFor="let p of m.permissions" class="m-switch row-switch">
          <input type="checkbox" [checked]="r.permissions.includes(p)" [disabled]="!r.editable || busy" (change)="toggle(r.role, p)"><span></span>
          <b>{{ label(p) }}</b></label>
        <button *ngIf="r.overridden && r.editable" class="m-btn ghost block mt-2" (click)="reset(r.role)" [disabled]="busy">Back to default</button>
        <p *ngIf="!r.editable" class="m-hint">This role cannot be changed.</p>
      </details>
    </ng-container>
  </div>
  `
})
export class MAccessComponent implements OnInit {
  private readonly catalogApi = inject(AdminCatalogApi);
  private readonly perms = inject(RolePermissionsService);
  private readonly toaster = inject(ToasterService);
  m: AccessMatrix | null = null;
  open = '';
  busy = false;
  error = '';

  ngOnInit(): void {
    this.catalogApi.accessControl().subscribe({ next: m => (this.m = m), error: e => (this.error = apiErrorMessage(e, 'Could not load access control')) });
  }

  roleName(r: string): string { return this.perms.getRoleDisplayName(r); }
  label(p: string): string { return p.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()); }

  toggle(role: string, p: string): void {
    if (!this.m) return;
    const row = this.m.roles.find(r => r.role === role)!;
    const next = row.permissions.includes(p) ? row.permissions.filter(x => x !== p) : [...row.permissions, p];
    this.busy = true;
    this.catalogApi.saveAccessControl({ [role]: next }).subscribe({
      next: m => { this.m = m; this.busy = false; },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }

  reset(role: string): void {
    this.busy = true;
    this.catalogApi.resetAccessControl(role).subscribe({
      next: m => { this.m = m; this.busy = false; },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}

/** The signed-in staff member's name and email. */
@Component({
  selector: 'app-m-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="m-page">
    <section class="m-sheet m-center" *ngIf="p">
      <span class="m-avatar xl">{{ (p.name || p.phone || '?').charAt(0) | uppercase }}</span>
      <div class="m-muted mt-2">{{ p.phone }} · {{ roleName(p.role) }}</div>
    </section>
    <section class="m-sheet" *ngIf="p">
      <label class="m-label">Name</label><input class="m-input" [(ngModel)]="name">
      <label class="m-label">Email</label><input class="m-input" type="email" [(ngModel)]="email">
      <button class="m-btn primary block mt-3" (click)="save()" [disabled]="busy">Save</button>
    </section>
  </div>
  `
})
export class MProfileComponent implements OnInit {
  private readonly catalogApi = inject(AdminCatalogApi);
  private readonly perms = inject(RolePermissionsService);
  private readonly toaster = inject(ToasterService);
  p: Profile | null = null;
  name = '';
  email = '';
  busy = false;

  ngOnInit(): void {
    this.catalogApi.profile().subscribe({ next: p => { this.p = p; this.name = p.name ?? ''; this.email = p.email ?? ''; }, error: () => {} });
  }

  roleName(r: string): string { return this.perms.getRoleDisplayName(r); }

  save(): void {
    this.busy = true;
    this.catalogApi.saveProfile({ name: this.name.trim(), email: this.email.trim() }).subscribe({
      next: p => { this.p = p; this.busy = false; this.toaster.showToast('Saved', ToastType.Success); },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}
