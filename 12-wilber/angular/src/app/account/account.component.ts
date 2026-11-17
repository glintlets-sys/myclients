import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HeaderComponent } from '../shared/header/header.component';
import { ApiService } from '@shared/core/api.service';
import { SessionService } from '@shared/core/session.service';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { printHtmlDocument } from '@shared/core/print-doc';
import { localProductImage } from '../core/local-product-images';
import {
  Address, Order, OrderStatus, PaymentStatus, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL
} from '@shared/core/models';

const CANCELLABLE: OrderStatus[] = ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED'];

interface TrackingView {
  loading: boolean;
  error?: string;
  status?: string;
  courier?: string;
  awb?: string;
  trackingUrl?: string;
  activities: { date?: string; activity?: string; location?: string }[];
}

/** Order card view model in the shape the approved template renders. */
interface OrderView {
  id: string;
  orderNumber: string;
  orderDate: string;
  paymentStatus: PaymentStatus;
  shippingStatus: OrderStatus;
  paymentMethod: string;
  totalAmount: number; // paise
  items: { productName: string; quantity: number; unitPrice: number; price: number; size?: string; image?: string; slug?: string }[];
  shippingAddress: { fullName: string; addressLine1: string; addressLine2?: string; city: string; state: string; pincode: string };
  canCancel: boolean;
  awaitingPayment: boolean;
  order: Order;
}

function emptyAddress(): Address {
  return { name: '', phone: '', alternatePhone: '', email: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', country: 'India', isDefault: false };
}

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, MoneyPipe],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss']
})
export class AccountComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  activeTab: 'profile' | 'addresses' | 'orders' = 'profile';
  addresses: Address[] = [];
  displayOrders: OrderView[] = [];
  ordersCursor: string | null = null;
  ordersLoading = false;
  tracking: Record<string, TrackingView> = {};
  busyOrderId: string | null = null;

  profileForm = { firstName: '', lastName: '', email: '', mobile: '' };

  // Address management
  add_address = false;
  editingAddressId: string | null = null;
  newAddress: Address = emptyAddress();

  loading = false;
  errorMessage = '';
  successMessage = '';

  ngOnInit(): void {
    if (this.router.url.startsWith('/orders')) {
      this.activeTab = 'orders';
    }
    this.fillProfile();
    this.api.me().subscribe({
      next: () => this.fillProfile(),
      error: err => console.error('Could not load profile', err)
    });
    if (this.activeTab === 'orders') this.loadOrders();
    else if (this.activeTab === 'addresses') this.refreshAddresses();
  }

  private fillProfile(): void {
    const user = this.session.user();
    if (!user) return;
    const parts = (user.name ?? '').trim().split(/\s+/).filter(Boolean);
    this.profileForm = {
      firstName: parts[0] ?? '',
      lastName: parts.slice(1).join(' '),
      email: user.email ?? '',
      mobile: user.phone ?? ''
    };
  }

  // ---------- tabs ----------
  setActiveTab(tab: 'profile' | 'addresses' | 'orders'): void {
    this.activeTab = tab;
    this.errorMessage = '';
    this.successMessage = '';
    if (tab === 'addresses') this.refreshAddresses();
    else if (tab === 'orders') this.loadOrders();
  }

  // ---------- profile ----------
  updateProfile(): void {
    if (!this.profileForm.firstName.trim() || !this.profileForm.lastName.trim()) {
      this.errorMessage = 'Please enter your first name and last name';
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    const name = `${this.profileForm.firstName.trim()} ${this.profileForm.lastName.trim()}`;
    this.api.updateMe({ name, email: this.profileForm.email.trim() || undefined }).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Profile updated successfully!';
      },
      error: err => {
        this.loading = false;
        this.errorMessage = apiErrorMessage(err, 'Failed to update profile. Please try again.');
      }
    });
  }

  // ---------- addresses ----------
  refreshAddresses(): void {
    this.api.addresses().subscribe({
      next: res => (this.addresses = res.addresses ?? []),
      error: err => (this.errorMessage = apiErrorMessage(err, 'Failed to load addresses. Please try again.'))
    });
  }

  addAdress(): void {
    this.editingAddressId = null;
    const user = this.session.user();
    this.newAddress = { ...emptyAddress(), name: user?.name ?? '', phone: user?.phone ?? '', email: user?.email ?? '' };
    this.add_address = true;
  }

  editAddress(address: Address): void {
    this.editingAddressId = address.id ?? null;
    this.newAddress = { ...emptyAddress(), ...address };
    this.add_address = true;
  }

  cancelNewAddress(): void {
    this.add_address = false;
    this.editingAddressId = null;
    this.newAddress = emptyAddress();
  }

  saveNewAddress(): void {
    const a = this.newAddress;
    const required: [keyof Address, string][] = [['name', 'name'], ['line1', 'address'], ['city', 'city'], ['state', 'state'], ['pincode', 'pincode'], ['phone', 'mobile number']];
    for (const [field, label] of required) {
      if (!String(a[field] ?? '').trim()) {
        this.errorMessage = `Please enter the ${label}`;
        return;
      }
    }
    if (!/^\d{6}$/.test(a.pincode)) {
      this.errorMessage = 'Pincode should be 6 digits.';
      return;
    }
    if (!/^\d{10}$/.test(a.phone)) {
      this.errorMessage = 'Mobile number should be 10 digits.';
      return;
    }
    this.errorMessage = '';
    const req = this.editingAddressId ? this.api.updateAddress(this.editingAddressId, a) : this.api.addAddress(a);
    const verb = this.editingAddressId ? 'updated' : 'added';
    req.subscribe({
      next: () => {
        this.cancelNewAddress();
        this.refreshAddresses();
        this.flash(`Address ${verb} successfully!`);
      },
      error: err => (this.errorMessage = apiErrorMessage(err, `Failed to save address. Please try again.`))
    });
  }

  setDefaultAddress(address: Address): void {
    if (!address.id) return;
    this.api.updateAddress(address.id, { ...address, isDefault: true }).subscribe({
      next: () => this.refreshAddresses(),
      error: err => (this.errorMessage = apiErrorMessage(err))
    });
  }

  deleteAddress(address: Address): void {
    if (!address.id) return;
    this.api.deleteAddress(address.id).subscribe({
      next: () => {
        this.refreshAddresses();
        this.flash('Address deleted successfully!');
      },
      error: err => (this.errorMessage = apiErrorMessage(err, 'Failed to delete address. Please try again.'))
    });
  }

  // ---------- orders ----------
  loadOrders(more = false): void {
    if (this.ordersLoading) return;
    this.ordersLoading = true;
    this.api.orders(more ? this.ordersCursor ?? undefined : undefined).subscribe({
      next: page => {
        const views = page.items.map(toOrderView);
        this.displayOrders = more ? [...this.displayOrders, ...views] : views;
        this.ordersCursor = page.nextCursor ?? null;
        this.ordersLoading = false;
      },
      error: err => {
        this.ordersLoading = false;
        this.errorMessage = apiErrorMessage(err, 'Failed to load orders. Please try again later.');
      }
    });
  }

  cancelOrder(view: OrderView): void {
    if (!view.canCancel || this.busyOrderId) return;
    if (!window.confirm(`Cancel order #${view.orderNumber}?`)) return;
    this.busyOrderId = view.id;
    this.api.cancelOrder(view.id, 'Cancelled by customer').subscribe({
      next: order => {
        this.busyOrderId = null;
        this.replaceOrder(order);
        this.flash('Order cancelled.');
      },
      error: err => {
        this.busyOrderId = null;
        this.errorMessage = apiErrorMessage(err, 'Could not cancel the order.');
      }
    });
  }

  trackOrder(view: OrderView): void {
    const s = view.order.shipment;
    this.tracking[view.id] = { loading: true, courier: s?.courier, awb: s?.awb, trackingUrl: s?.trackingUrl, activities: [] };
    this.api.tracking(view.id).subscribe({
      next: res => {
        const data = res?.tracking?.tracking_data ?? {};
        const shipment = res?.shipment ?? s ?? {};
        this.tracking[view.id] = {
          loading: false,
          status: data?.shipment_track?.[0]?.current_status
            ?? ORDER_STATUS_LABEL[(res?.status as OrderStatus)] ?? ORDER_STATUS_LABEL[view.shippingStatus],
          courier: shipment.courier,
          awb: shipment.awb,
          trackingUrl: data?.track_url || shipment.trackingUrl,
          activities: Array.isArray(data?.shipment_track_activities) ? data.shipment_track_activities.slice(0, 10) : []
        };
      },
      error: err => {
        this.tracking[view.id] = { ...this.tracking[view.id], loading: false, error: apiErrorMessage(err, 'Tracking is not available yet.') };
      }
    });
  }

  /** Opens the order's GST tax invoice for printing / saving as PDF. */
  viewInvoice(view: OrderView): void {
    this.api.myInvoice(view.id).subscribe({
      next: v => { if (!printHtmlDocument(v.html)) window.alert('Please allow pop-ups to view the invoice.'); },
      error: err => window.alert(apiErrorMessage(err, 'The invoice is not available yet.'))
    });
  }

  completePayment(view: OrderView): void {
    this.router.navigate(['/payment-response'], { queryParams: { orderId: view.id } });
  }

  private replaceOrder(order: Order): void {
    this.displayOrders = this.displayOrders.map(v => (v.id === order.id ? toOrderView(order) : v));
  }

  // ---------- labels ----------
  getPaymentStatusClass(status: PaymentStatus): string {
    switch (status) {
      case 'PAID':
      case 'COD_COLLECTED': return 'badge bg-success';
      case 'PENDING':
      case 'COD_PENDING': return 'badge bg-warning text-dark';
      case 'FAILED': return 'badge bg-danger';
      case 'REFUND_PENDING': return 'badge bg-info text-dark';
      default: return 'badge bg-secondary';
    }
  }

  getPaymentStatusText(status: PaymentStatus): string {
    return PAYMENT_STATUS_LABEL[status] ?? status;
  }

  getShippingStatusClass(status: OrderStatus): string {
    switch (status) {
      case 'PENDING_PAYMENT': return 'badge bg-warning text-dark';
      case 'PLACED':
      case 'CONFIRMED': return 'badge bg-secondary';
      case 'READY_TO_DISPATCH': return 'badge bg-info text-dark';
      case 'DISPATCHED': return 'badge bg-primary';
      case 'DELIVERED': return 'badge bg-success';
      case 'CANCELLED':
      case 'RETURNED': return 'badge bg-danger';
      default: return 'badge bg-secondary';
    }
  }

  getShippingStatusText(status: OrderStatus): string {
    return ORDER_STATUS_LABEL[status] ?? status;
  }

  logout(): void {
    const done = () => {
      this.session.clear();
      this.router.navigate(['/']);
    };
    this.api.logout().subscribe({ next: done, error: done });
  }

  private flash(message: string): void {
    this.successMessage = message;
    setTimeout(() => {
      if (this.successMessage === message) this.successMessage = '';
    }, 3000);
  }
}

function toOrderView(o: Order): OrderView {
  const a = o.shippingAddress ?? ({} as Address);
  return {
    id: o.id,
    orderNumber: o.id,
    orderDate: o.createdAt,
    paymentStatus: o.paymentStatus,
    shippingStatus: o.status,
    paymentMethod: o.paymentMethod,
    totalAmount: o.totalPaise,
    items: (o.lines ?? []).map(l => ({
      productName: l.name,
      quantity: l.qty,
      unitPrice: l.unitPricePaise,
      price: l.lineTotalPaise,
      size: l.variantName,
      image: l.image ? localProductImage(l.image) : undefined,
      slug: l.slug
    })),
    shippingAddress: {
      fullName: a.name,
      addressLine1: a.line1,
      addressLine2: [a.line2, a.landmark].filter(Boolean).join(', '),
      city: a.city,
      state: a.state,
      pincode: a.pincode
    },
    canCancel: CANCELLABLE.includes(o.status),
    awaitingPayment: o.status === 'PENDING_PAYMENT' && o.paymentMethod !== 'cod',
    order: o
  };
}
