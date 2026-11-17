import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { AdminProductsComponent } from './admin-products/admin-products.component';
import { AdminCategoriesComponent } from './admin-categories/admin-categories.component';
import { AdminOrdersComponent } from './admin-orders/admin-orders.component';
import { AdminCustomersComponent } from './admin-customers/admin-customers.component';
import { AdminSettingsComponent } from './admin-settings/admin-settings.component';
import { AdminStockConsignmentComponent } from './admin-stock-consignment/admin-stock-consignment.component';
import { AdminBlogsComponent } from './admin-blogs/admin-blogs.component';
import { AdminRecommendationsComponent } from './admin-recommendations/admin-recommendations.component';
import { AdminUsersComponent } from './admin-users/admin-users.component';
import { AdminBannersComponent } from './admin-banners/admin-banners.component';
import { AdminTestimonialsComponent } from './admin-testimonials/admin-testimonials.component';
import { AdminAccessControlComponent } from './admin-access-control/admin-access-control.component';
import { AdminProfileComponent } from './admin-profile/admin-profile.component';
import { AdminCatalogApi } from '../core/admin-catalog-api';
import { RolePermissionsService } from '../core/role-permissions.service';
import { SessionService } from '@shared/core/session.service';
import { AdminOpsApi } from '../core/admin-ops-api';
import { AdminConfirmationsComponent } from './ops/admin-confirmations.component';
import { AdminStaffOrderComponent } from './ops/admin-staff-order.component';
import { AdminInvoicesComponent } from './ops/admin-invoices.component';
import { AdminCollectionsComponent } from './ops/admin-collections.component';
import { AdminReportsComponent } from './ops/admin-reports.component';
import { AdminAuditComponent } from './ops/admin-audit.component';
import { AdminQuotesComponent } from './ops/admin-quotes.component';
import { AdminSeoComponent } from './admin-seo/admin-seo.component';
import { ApiService } from '@shared/core/api.service';
import { isSupportUser } from '../core/staff-guard';
import { environment } from '../../environments/environment';
import { setPreferredView } from '../mobile/m-common';

/** One screen in the menu search (blue bar). */
interface MenuEntry { label: string; group: string; groupKey: string; icon: string; view: string; tab?: string; words: string; }

const SECTION_ALIASES: Record<string, string> = {
  stock: 'stock-consignment',
  stockconsignment: 'stock-consignment',
};

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    RouterModule,
    AdminDashboardComponent,
    AdminProductsComponent,
    AdminCategoriesComponent,
    AdminOrdersComponent,
    AdminCustomersComponent,
    AdminSettingsComponent,
    AdminStockConsignmentComponent,
    AdminBlogsComponent,
    AdminRecommendationsComponent,
    AdminUsersComponent,
    AdminBannersComponent,
    AdminTestimonialsComponent,
    AdminAccessControlComponent,
    AdminProfileComponent,
    AdminConfirmationsComponent,
    AdminStaffOrderComponent,
    AdminInvoicesComponent,
    AdminCollectionsComponent,
    AdminReportsComponent,
    AdminAuditComponent,
    AdminQuotesComponent,
    AdminSeoComponent
  ],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly rolePermissionsService = inject(RolePermissionsService);
  private readonly catalogApi = inject(AdminCatalogApi);
  private readonly api = inject(ApiService);
  private readonly title = inject(Title);

  /** The tenant's storefront ("View site"). */
  readonly storefrontUrl = environment.storefrontUrl;
  /** Store name from the public config; the admin build itself names no tenant. */
  storeName = '';

  /** Phones: the sidebar is an off-canvas drawer opened from the header's menu button. */
  sidebarOpen = false;
  readonly opsApi = inject(AdminOpsApi);
  /** ?quote= deep link into the Quotations screen (e.g. from an order). */
  quoteParam: string | null = null;
  private pendingTimer?: ReturnType<typeof setInterval>;

  activeView = 'dashboard';
  /** Stock Consignments is a distributor-style flow; kept in code but hidden from the menu. */
  readonly showConsignments = false;
  /** Re-enabled for Wilber (Krishna, 17 Nov 2026). Set to false to hide the Quotes menu/section again. */
  readonly showQuotes = true;
  readonly showCollections = false;
  readonly showAudit = false;
  /** Set by Categories → "Add product"; Manage Products opens its editor with this category ticked. */
  addToCategory: string | null = null;
  currentUserRole = '';
  accessibleSections: string[] = [];

  /** Which sidebar groups are expanded. */
  public sections: Record<string, boolean> = {
    dashboard: true,
    products: true,
    orders: true,
    customers: true,
    content: true,
    settings: true,
    stock: true,
    marketing: true,
    reports: true
  };

  ngOnInit(): void {
    this.api.config().subscribe({
      next: c => {
        this.storeName = c.store?.name ?? '';
        if (this.storeName) this.title.setTitle(`${this.storeName} admin`);
      },
      error: () => {}
    });
    this.currentUserRole = this.session.user()?.role ?? '';
    this.accessibleSections = this.rolePermissionsService.getAccessibleSections();
    if (this.accessibleSections.length > 0 && !this.accessibleSections.includes(this.activeView)) {
      this.activeView = this.accessibleSections[0];
    }
    this.route.queryParams.subscribe(params => {
      const section = params['section'];
      this.quoteParam = params['quote'] ?? null;
      if (section) this.navigateToSection(section);
      // The router resets the tab to the route title ("Store admin") on every ?section= navigation.
      if (this.storeName) setTimeout(() => this.title.setTitle(`${this.storeName} admin`));
    });
    // Permissions can change while signed in (access-control overrides): refresh them from the server.
    this.catalogApi.profile().subscribe({
      next: () => {
        this.currentUserRole = this.session.user()?.role ?? '';
        this.accessibleSections = this.rolePermissionsService.getAccessibleSections();
        if (!this.canAccessSection(this.activeView) && this.accessibleSections.length) this.activeView = this.accessibleSections[0];
      },
      error: () => {}
    });
    if (this.canAccessSection('confirmations')) {
      this.opsApi.refreshPendingCount();
      this.pendingTimer = setInterval(() => this.opsApi.refreshPendingCount(), 120_000);
    }
  }

  ngOnDestroy(): void {
    if (this.pendingTimer) clearInterval(this.pendingTimer);
  }

  /** Jump to an order in the Orders screen (used by confirmations, staff orders, quotations). */
  openOrder(orderId: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { section: 'orders', order: orderId } })
      .then(() => { this.activeView = ''; setTimeout(() => (this.activeView = 'orders')); });
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.sidebarOpen = false;
  }

  /** Signed in through the platform console's "Open admin" (short-lived support login). */
  get isSupportSession(): boolean {
    return isSupportUser(this.session.user());
  }

  get sessionExpiresAt(): Date | null {
    const exp = this.session.session()?.expiresAt;
    return exp ? new Date(exp * 1000) : null;
  }

  /** Switch to the mobile admin (/m) and remember the choice in this browser. */
  mobileView(): void {
    setPreferredView('mobile');
    this.router.navigate(['/m']);
  }

  signOut(): void {
    const done = () => {
      this.session.clear();
      this.router.navigate(['/login']);
    };
    // Support sessions simply expire; the API may refuse to revoke them, which is fine.
    this.api.logout().subscribe({ next: done, error: done });
  }

  get userName(): string {
    const u = this.session.user();
    return u?.name || u?.phone || '';
  }

  /** System owner only (Krishna, 9663747110). Publish & SEO is hidden from everyone else for now. */
  get isSystemAdmin(): boolean {
    return this.session.user()?.phone === '9663747110';
  }

  public canAccessSection(section: string): boolean {
    // Publish & SEO is restricted to the system owner until the client is ready for it.
    if (section === 'seo' && !this.isSystemAdmin) return false;
    return this.rolePermissionsService.canAccessSection(this.currentUserRole, section);
  }

  public canAccessFeature(feature: string): boolean {
    return this.rolePermissionsService.canAccessFeature(this.currentUserRole, feature);
  }

  public getRoleDisplayName(): string {
    return this.rolePermissionsService.getRoleDisplayName(this.currentUserRole);
  }

  public toggleSection(section: string): void {
    this.sections[section] = !this.sections[section];
  }

  /** Switches the main view and keeps ?section= in the URL so reloads land on the same screen. */
  private show(view: string): void {
    if (!this.canAccessSection(view)) return;
    this.activeView = view;
    this.sidebarOpen = false;
    this.router.navigate([], { relativeTo: this.route, queryParams: { section: view }, replaceUrl: true });
  }

  showDashboard() { this.show('dashboard'); }
  showProducts() { this.addToCategory = null; this.show('products'); }
  addProductTo(categoryId: string) {
    if (!this.canAccessSection('products')) return;
    this.addToCategory = categoryId;
    this.activeView = '';   // re-create Manage Products so it opens the editor
    setTimeout(() => this.show('products'));
  }
  showCategories() { this.show('categories'); }
  showOrders() { this.show('orders'); }
  showCustomers() { this.show('customers'); }
  showSettings() { this.settingsTab = null; this.show('settings'); }
  showBlogs() { this.show('blogs'); }
  showRecommendations() { this.show('recommendations'); }
  showAdminUsers() { this.show('admin-users'); }
  showStockConsignment() { this.show('stock-consignment'); }
  showBanners() { this.show('banners'); }
  showTestimonials() { this.show('testimonials'); }
  showAccessControl() { this.show('access-control'); }
  showProfile() { this.show('profile'); }
  showOps(view: string) { this.show(view); }

  // ---------- menu search (blue bar) ----------
  /** Settings tab to open (set by the menu search, e.g. "shipping" → Shipping Settings). */
  settingsTab: string | null = null;
  menuQuery = '';
  menuResults: MenuEntry[] = [];
  menuIndex = 0;
  menuSearchOpen = false;

  /** Every screen reachable from the left menu (plus the Settings tabs), with extra words people may type. */
  private get menuEntries(): MenuEntry[] {
    const a = (s: string) => this.canAccessSection(s);
    const all: (MenuEntry & { show: boolean })[] = [
      { label: 'Overview', group: 'Dashboard', groupKey: 'dashboard', icon: 'fa-chart-line', view: 'dashboard', words: 'dashboard home today sales summary', show: a('dashboard') },
      { label: 'Manage Users', group: 'Dashboard', groupKey: 'dashboard', icon: 'fa-users-cog', view: 'admin-users', words: 'staff team employees users add staff role', show: a('admin-users') },
      { label: 'My Profile', group: 'Dashboard', groupKey: 'dashboard', icon: 'fa-id-badge', view: 'profile', words: 'my account name phone email', show: true },
      { label: 'Manage Products', group: 'Products', groupKey: 'products', icon: 'fa-list', view: 'products', words: 'items stock price prices export bulk update excel inventory out of stock edit product', show: a('products') },
      { label: 'Categories', group: 'Products', groupKey: 'products', icon: 'fa-tags', view: 'categories', words: 'add product new product category sub-category parent images', show: a('categories') },
      { label: 'Publish & SEO', group: 'Products', groupKey: 'products', icon: 'fa-search', view: 'seo', words: 'publish website update sitemap google seo', show: a('seo') },
      { label: 'All Orders', group: 'Orders', groupKey: 'orders', icon: 'fa-clipboard-list', view: 'orders', words: 'orders dispatch courier awb delivered cancel status track', show: a('orders') },
      { label: 'Pending Confirmations', group: 'Orders', groupKey: 'orders', icon: 'fa-user-check', view: 'confirmations', words: 'confirm new orders pending approve', show: a('confirmations') },
      { label: 'Place Order', group: 'Orders', groupKey: 'orders', icon: 'fa-phone-alt', view: 'staff-order', words: 'new order phone order staff order create order customer order', show: a('staff-order') },
      { label: 'Quotations', group: 'Orders', groupKey: 'orders', icon: 'fa-file-signature', view: 'quotes', words: 'quote quotation estimate', show: this.showQuotes && a('quotes') },
      { label: 'Invoices', group: 'Orders', groupKey: 'orders', icon: 'fa-file-invoice', view: 'invoices', words: 'invoice bill gst invoice prefix download print', show: a('invoices') },
      { label: 'COD Collections', group: 'Orders', groupKey: 'orders', icon: 'fa-hand-holding-usd', view: 'collections', words: 'cod cash collected payment received', show: this.showCollections && a('collections') },
      { label: 'Sales & GST Reports', group: 'Reports', groupKey: 'reports', icon: 'fa-chart-pie', view: 'reports', words: 'reports sales gst tax revenue product report', show: a('reports') },
      { label: 'Audit Log', group: 'Reports', groupKey: 'reports', icon: 'fa-history', view: 'audit', words: 'audit history log who changed', show: this.showAudit && a('audit') },
      { label: 'Stock Consignments', group: 'Stock', groupKey: 'stock', icon: 'fa-truck', view: 'stock-consignment', words: 'consignment stock inward', show: this.showConsignments && a('stock-consignment') },
      { label: 'Manage Customers', group: 'Customers', groupKey: 'customers', icon: 'fa-user-friends', view: 'customers', words: 'customers buyers clients block contacts', show: a('customers') },
      { label: 'Blogs', group: 'Content', groupKey: 'content', icon: 'fa-blog', view: 'blogs', words: 'blog articles posts content', show: this.canAccessFeature('manage_blogs') },
      { label: 'Product Recommendations', group: 'Content', groupKey: 'content', icon: 'fa-thumbs-up', view: 'recommendations', words: 'related products bought together similar', show: this.canAccessFeature('manage_recommendations') },
      { label: 'Banners', group: 'Marketing', groupKey: 'marketing', icon: 'fa-images', view: 'banners', words: 'marketing hero slider home banner images category banner', show: a('banners') },
      { label: 'Testimonials', group: 'Marketing', groupKey: 'marketing', icon: 'fa-comment-dots', view: 'testimonials', words: 'testimonials reviews happy customers ratings feedback our happy customers', show: a('testimonials') },
      { label: 'General Settings', group: 'Settings', groupKey: 'settings', icon: 'fa-tools', view: 'settings', tab: 'platform', words: 'store settings store details name logo address gst gstin whatsapp phone', show: a('settings') },
      { label: 'Payment Settings', group: 'Settings', groupKey: 'settings', icon: 'fa-credit-card', view: 'settings', tab: 'payment', words: 'payment cod cash on delivery razorpay online upi', show: a('settings') },
      { label: 'Shipping Settings', group: 'Settings', groupKey: 'settings', icon: 'fa-shipping-fast', view: 'settings', tab: 'shipping', words: 'shipping delivery charges free delivery fee', show: a('settings') },
      { label: 'SMS Settings', group: 'Settings', groupKey: 'settings', icon: 'fa-sms', view: 'settings', tab: 'sms', words: 'sms otp text messages', show: a('settings') },
      { label: 'Email Settings', group: 'Settings', groupKey: 'settings', icon: 'fa-envelope', view: 'settings', tab: 'email', words: 'email mail notifications', show: a('settings') },
      { label: 'Coupons', group: 'Settings', groupKey: 'settings', icon: 'fa-ticket-alt', view: 'settings', tab: 'coupons', words: 'coupon coupons discount offer code', show: this.canAccessFeature('manage_discounts') },
      { label: 'Access Control', group: 'Settings', groupKey: 'settings', icon: 'fa-user-lock', view: 'access-control', words: 'roles permissions access rights', show: a('access-control') },
    ];
    return all.filter(e => e.show);
  }

  searchMenu(): void {
    const words = this.menuQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    this.menuIndex = 0;
    this.menuSearchOpen = true;
    if (!words.length) { this.menuResults = []; return; }
    const score = (e: MenuEntry) => {
      const label = e.label.toLowerCase(), hay = `${label} ${e.group.toLowerCase()} ${e.words}`;
      if (!words.every(w => hay.includes(w))) return -1;
      return label.startsWith(words[0]) ? 3 : label.includes(words[0]) ? 2 : 1;
    };
    this.menuResults = this.menuEntries
      .map(e => ({ e, s: score(e) }))
      .filter(x => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .map(x => x.e);
  }

  onMenuSearchKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') { event.preventDefault(); this.menuIndex = Math.min(this.menuIndex + 1, this.menuResults.length - 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); this.menuIndex = Math.max(this.menuIndex - 1, 0); }
    else if (event.key === 'Enter') { event.preventDefault(); const e = this.menuResults[this.menuIndex]; if (e) this.openMenuEntry(e); }
    else if (event.key === 'Escape') { this.clearMenuSearch(); (event.target as HTMLElement).blur(); }
  }

  openMenuEntry(e: MenuEntry): void {
    this.sections[e.groupKey] = true;          // make sure its group is open in the left menu
    this.clearMenuSearch();
    if (e.view === 'settings') {
      this.settingsTab = e.tab ?? null;
      if (this.activeView === 'settings') {   // re-create Settings so it opens on the new tab
        this.activeView = '';
        setTimeout(() => this.show('settings'));
        return;
      }
    }
    this.show(e.view);
  }

  clearMenuSearch(): void {
    this.menuQuery = '';
    this.menuResults = [];
    this.menuSearchOpen = false;
  }

  /** "/" anywhere (when not typing in a field) jumps to the menu search. */
  @HostListener('document:keydown', ['$event'])
  onSlash(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target;
    if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const box = document.getElementById('adminMenuSearch') as HTMLInputElement | null;
    if (box && box.offsetParent) { event.preventDefault(); box.focus(); }
  }

  private navigateToSection(section: string): void {
    const key = section.toLowerCase();
    const view = SECTION_ALIASES[key] ?? key;
    if (view !== this.activeView && this.canAccessSection(view)) this.activeView = view;
  }
}
