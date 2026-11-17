import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AdminApi } from '../../core/admin-api';
import { MoneyPipe, formatPaise } from '@shared/core/money.pipe';
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, OrderStatus, PaymentStatus } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';

/** Order summary as returned in the dashboard's recentOrders. */
export interface OrderSummary {
  id: string;
  customer?: string;
  phone?: string;
  totalPaise: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  items: number;
  createdAt: string;
}

export interface DashboardData {
  ordersByStatus: Record<string, number>;
  revenue30dPaise: number;
  orders30d: number;
  revenueTodayPaise: number;
  ordersToday: number;
  dailyRevenuePaise: { date: string; revenuePaise: number }[];
  customers: number;
  products: number;
  activeProducts: number;
  lowStock: { productId: string; name: string; variantId: string; variantName: string; qty: number }[];
  recentOrders: OrderSummary[];
}

const PENDING: OrderStatus[] = ['PLACED', 'CONFIRMED', 'READY_TO_DISPATCH'];

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, MoneyPipe],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);

  isLoading = true;
  error = '';
  data: DashboardData | null = null;

  stats = {
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    orders30d: 0,
    revenue30dPaise: 0,
    revenueTodayPaise: 0,
    ordersToday: 0,
    totalCustomers: 0,
    totalProducts: 0,
    activeProducts: 0,
  };

  recentOrders: OrderSummary[] = [];
  dailyRevenue: { date: string; revenuePaise: number; pct: number }[] = [];
  lowStock: DashboardData['lowStock'] = [];

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.isLoading = true;
    this.error = '';
    this.api.admin.dashboard().subscribe({
      next: (d: DashboardData) => {
        this.data = d;
        this.applyData(d);
        this.isLoading = false;
      },
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load the dashboard.');
        this.isLoading = false;
      }
    });
  }

  private applyData(d: DashboardData): void {
    const byStatus = d.ordersByStatus || {};
    const count = (s: string) => byStatus[s] ?? 0;
    this.stats = {
      totalOrders: Object.entries(byStatus).filter(([s]) => s !== 'PENDING_PAYMENT').reduce((a, [, n]) => a + n, 0),
      completedOrders: count('DELIVERED'),
      pendingOrders: PENDING.reduce((a, s) => a + count(s), 0),
      orders30d: d.orders30d ?? 0,
      revenue30dPaise: d.revenue30dPaise ?? 0,
      revenueTodayPaise: d.revenueTodayPaise ?? 0,
      ordersToday: d.ordersToday ?? 0,
      totalCustomers: d.customers ?? 0,
      totalProducts: d.products ?? 0,
      activeProducts: d.activeProducts ?? 0,
    };
    this.recentOrders = (d.recentOrders || []).slice(0, 5);
    this.lowStock = d.lowStock || [];
    const series = d.dailyRevenuePaise || [];
    const max = Math.max(1, ...series.map(p => p.revenuePaise));
    this.dailyRevenue = series.map(p => ({ ...p, pct: Math.round((p.revenuePaise / max) * 100) }));
  }

  /** Orders placed and waiting for the store to confirm them. */
  get awaitingConfirmation(): number {
    return this.data?.ordersByStatus?.['PLACED'] ?? 0;
  }

  get outOfStockCount(): number {
    return this.lowStock.filter(l => l.qty <= 0).length;
  }

  get lowStockCount(): number {
    return this.lowStock.filter(l => l.qty > 0).length;
  }

  /** Open order statuses with at least one order, for the phone dashboard chips. */
  get statusChips(): { status: OrderStatus; count: number }[] {
    const open: OrderStatus[] = ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'READY_TO_DISPATCH', 'DISPATCHED'];
    return open.map(s => ({ status: s, count: this.data?.ordersByStatus?.[s] ?? 0 })).filter(c => c.count > 0);
  }

  navigateTo(section: string): void {
    this.router.navigate(['/'], { queryParams: { section } });
  }

  refreshDashboard(): void {
    this.loadDashboardData();
  }

  avgOrderValuePaise(): number {
    return this.stats.orders30d > 0 ? Math.round(this.stats.revenue30dPaise / this.stats.orders30d) : 0;
  }

  getSuccessRate(): number {
    const closed = this.stats.completedOrders + (this.data?.ordersByStatus?.['CANCELLED'] ?? 0) + (this.data?.ordersByStatus?.['RETURNED'] ?? 0);
    return closed === 0 ? 0 : Math.round((this.stats.completedOrders / closed) * 100);
  }

  formatCurrency(paise: number): string {
    return formatPaise(paise);
  }

  statusLabel(s: OrderStatus): string {
    return ORDER_STATUS_LABEL[s] ?? s;
  }

  paymentLabel(s: PaymentStatus): string {
    return PAYMENT_STATUS_LABEL[s] ?? s;
  }

  getOrderStatusClass(s: OrderStatus): string {
    switch (s) {
      case 'DELIVERED': return 'badge bg-success';
      case 'DISPATCHED': return 'badge bg-info';
      case 'CANCELLED': case 'RETURNED': return 'badge bg-danger';
      case 'PENDING_PAYMENT': return 'badge bg-secondary';
      default: return 'badge bg-warning';
    }
  }

  getPaymentStatusClass(s: PaymentStatus): string {
    switch (s) {
      case 'PAID': case 'COD_COLLECTED': case 'REFUNDED': return 'badge bg-success';
      case 'FAILED': return 'badge bg-danger';
      case 'REFUND_PENDING': return 'badge bg-info';
      default: return 'badge bg-warning';
    }
  }

  openOrder(id: string): void {
    this.router.navigate(['/'], { queryParams: { section: 'orders', order: id } });
  }

  navigateToProducts(): void {
    this.router.navigate(['/'], { queryParams: { section: 'products' } });
  }

  navigateToCustomers(): void {
    this.router.navigate(['/'], { queryParams: { section: 'customers' } });
  }

  navigateToOrders(): void {
    this.router.navigate(['/'], { queryParams: { section: 'orders' } });
  }

  navigateToStock(): void {
    this.router.navigate(['/'], { queryParams: { section: 'stock-consignment' } });
  }
}
