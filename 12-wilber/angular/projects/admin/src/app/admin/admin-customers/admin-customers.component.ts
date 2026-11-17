import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import * as XLSX from 'xlsx';
import { AdminApi } from '../../core/admin-api';
import { SessionService } from '@shared/core/session.service';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { Address, Order, ORDER_STATUS_LABEL, OrderStatus, PAYMENT_STATUS_LABEL, PaymentStatus, User } from '@shared/core/models';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

export interface CustomerDetail extends User {
  addresses: Address[];
  orders: Order[];
}

type SortField = 'name' | 'email' | 'createdAt' | 'lastLoginAt';

@Component({
  selector: 'app-admin-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './admin-customers.component.html',
  styleUrl: './admin-customers.component.scss'
})
export class AdminCustomersComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);
  private readonly session = inject(SessionService);
  private readonly toaster = inject(ToasterService);
  private readonly router = inject(Router);

  customers: User[] = [];
  nextCursor: string | null = null;
  isLoading = false;
  isLoadingMore = false;
  error = '';

  searchTerm = '';
  selectedStatus = '';
  sortField: SortField = 'createdAt';
  sortDirection: 'asc' | 'desc' = 'desc';

  /** Customer whose details panel is open. */
  selected: CustomerDetail | null = null;
  loadingDetailId: string | null = null;

  private readonly search$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.subscriptions.push(this.search$.pipe(debounceTime(350)).subscribe(() => this.loadCustomers()));
    this.loadCustomers();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  loadCustomers(): void {
    this.isLoading = true;
    this.error = '';
    this.api.admin.customers({ q: this.searchTerm.trim(), size: 100 }).subscribe({
      next: page => {
        this.customers = page.items;
        this.nextCursor = page.nextCursor ?? null;
        this.isLoading = false;
      },
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load customers.');
        this.customers = [];
        this.isLoading = false;
      }
    });
  }

  loadMore(): void {
    if (!this.nextCursor || this.isLoadingMore) return;
    this.isLoadingMore = true;
    this.api.admin.customers({ q: this.searchTerm.trim(), size: 100, cursor: this.nextCursor }).subscribe({
      next: page => {
        this.customers.push(...page.items);
        this.nextCursor = page.nextCursor ?? null;
        this.isLoadingMore = false;
      },
      error: err => {
        this.toaster.showToast(apiErrorMessage(err), ToastType.Error, 4000);
        this.isLoadingMore = false;
      }
    });
  }

  onSearchInput(): void {
    this.search$.next();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = '';
    this.loadCustomers();
  }

  refreshCustomers(): void {
    this.loadCustomers();
  }

  /** Loaded customers after the status filter and sort. */
  get visibleCustomers(): User[] {
    const list = this.selectedStatus ? this.customers.filter(c => c.status === this.selectedStatus) : [...this.customers];
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    const f = this.sortField;
    return list.sort((a, b) => String(a[f] ?? '').toLowerCase().localeCompare(String(b[f] ?? '').toLowerCase()) * dir);
  }

  sortBy(field: SortField): void {
    if (this.sortField === field) this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
  }

  getSortIcon(field: SortField): string {
    if (this.sortField !== field) return 'fas fa-sort text-muted';
    return this.sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
  }

  countByStatus(status: string): number {
    return this.customers.filter(c => c.status === status).length;
  }

  activeLast30Days(): number {
    const since = Date.now() - 30 * 24 * 3600 * 1000;
    return this.customers.filter(c => c.lastLoginAt && new Date(c.lastLoginAt).getTime() >= since).length;
  }

  // ---------- details ----------

  viewCustomerDetails(customer: User): void {
    if (this.selected?.id === customer.id) {
      this.selected = null;
      return;
    }
    this.loadingDetailId = customer.id;
    this.api.admin.customer(customer.id).subscribe({
      next: (d: CustomerDetail) => {
        this.selected = { ...d, addresses: d.addresses || [], orders: d.orders || [] };
        this.loadingDetailId = null;
      },
      error: err => {
        this.loadingDetailId = null;
        this.toaster.showToast(apiErrorMessage(err, 'Could not load customer details.'), ToastType.Error, 4000);
      }
    });
  }

  closeDetails(): void {
    this.selected = null;
  }

  lifetimeValuePaise(d: CustomerDetail): number {
    return d.orders
      .filter(o => o.status !== 'CANCELLED' && o.status !== 'PENDING_PAYMENT' && o.status !== 'RETURNED')
      .reduce((a, o) => a + o.totalPaise, 0);
  }

  openOrder(id: string): void {
    this.router.navigate(['/'], { queryParams: { section: 'orders', order: id } });
  }

  /** Blocking needs the manage_users permission on the server. */
  canChangeStatus(): boolean {
    return this.session.can('manage_users');
  }

  toggleCustomerStatus(customer: User): void {
    const next = customer.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';
    if (next === 'BLOCKED' && !confirm(`Block ${customer.name || customer.phone}? They will be logged out and cannot sign in.`)) return;
    this.api.admin.setUserStatus(customer.id, next).subscribe({
      next: u => {
        Object.assign(customer, u);
        if (this.selected?.id === u.id) this.selected = { ...this.selected, ...u };
        this.toaster.showToast(`Customer ${next === 'BLOCKED' ? 'blocked' : 'unblocked'}`, ToastType.Success, 3000);
      },
      error: err => this.toaster.showToast(apiErrorMessage(err, 'Could not change status.'), ToastType.Error, 4000)
    });
  }

  // ---------- helpers ----------

  formatAddress(a: Address): string {
    return [a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ');
  }

  statusLabel(s: OrderStatus): string {
    return ORDER_STATUS_LABEL[s] ?? s;
  }

  paymentLabel(s: PaymentStatus): string {
    return PAYMENT_STATUS_LABEL[s] ?? s;
  }

  exportCustomers(): void {
    const list = this.visibleCustomers;
    if (list.length === 0) {
      this.toaster.showToast('No customers to export', ToastType.Info, 3000);
      return;
    }
    const ws = XLSX.utils.json_to_sheet(list.map(c => ({
      'ID': c.id,
      'Name': c.name ?? '',
      'Phone': c.phone,
      'Email': c.email ?? '',
      'Status': c.status,
      'Registered': c.createdAt ? new Date(c.createdAt).toLocaleString('en-IN') : '',
      'Last Login': c.lastLoginAt ? new Date(c.lastLoginAt).toLocaleString('en-IN') : '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, `customers-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
