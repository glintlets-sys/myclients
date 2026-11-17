import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { HeaderComponent } from '../shared/header/header.component';
import { ApiService } from '@shared/core/api.service';
import { CartStoreService } from '../core/cart-store.service';
import { SessionService } from '@shared/core/session.service';
import { PaymentLauncherService } from '../core/payment-launcher.service';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { Address, PaymentOption, Quote, QuoteLine } from '@shared/core/models';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

export const PAYMENT_METHOD_LABEL: Record<PaymentOption['id'], string> = {
  phonepe: 'PhonePe (UPI / Cards / Netbanking)',
  razorpay: 'Razorpay (UPI / Cards / Netbanking)',
  ccavenue: 'CCAvenue (Cards / Netbanking)',
  cod: 'Cash on Delivery',
};

const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

function emptyAddress(): Address {
  return { name: '', phone: '', email: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', country: 'India' };
}

/**
 * Checkout: everything shown comes from POST /v1/checkout/summary (server-priced quote + addresses).
 * Nothing is priced on the client.
 */
@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, HeaderComponent, MoneyPipe],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly cart = inject(CartStoreService);
  private readonly session = inject(SessionService);
  private readonly launcher = inject(PaymentLauncherService);
  private readonly router = inject(Router);
  private readonly toaster = inject(ToasterService);

  readonly paymentLabels = PAYMENT_METHOD_LABEL;
  readonly states = INDIAN_STATES;

  quote: Quote | null = null;
  addresses: Address[] = [];
  selectedAddressId: string | null = null;
  paymentMethod: PaymentOption['id'] | null = null;
  couponCode: string | null = null;
  couponInput = '';

  loading = true;
  updating = false;
  placing = false;
  errorMessage = '';

  // address form
  showAddressForm = false;
  editingAddressId: string | null = null;
  addressForm: Address = emptyAddress();
  savingAddress = false;
  addressError = '';

  get cartItems(): QuoteLine[] {
    return this.quote?.lines ?? [];
  }

  get totalItems(): number {
    return this.cartItems.reduce((n, l) => n + l.qty, 0);
  }

  get selectedAddress(): Address | null {
    return this.addresses.find(a => a.id === this.selectedAddressId) ?? null;
  }

  /** Only the gateways the server says are usable for this order. */
  get availablePaymentMethods(): PaymentOption[] {
    return (this.quote?.paymentMethods ?? []).filter(m => m.available);
  }

  get canPlaceOrder(): boolean {
    return !!this.quote && this.quote.canCheckout && this.cartItems.length > 0 && !!this.selectedAddressId
      && !!this.paymentMethod && !this.placing && !this.updating;
  }

  ngOnInit(): void {
    this.loadSummary();
  }

  loadSummary(): void {
    this.updating = true;
    this.errorMessage = '';
    this.api.checkoutSummary({
      addressId: this.selectedAddressId ?? undefined,
      couponCode: this.couponCode ?? undefined,
      paymentMethod: this.paymentMethod ?? undefined,
    }).subscribe({
      next: res => {
        this.quote = res.quote;
        this.addresses = res.addresses ?? [];
        this.selectedAddressId = res.selectedAddressId ?? this.addresses.find(a => a.isDefault)?.id ?? this.addresses[0]?.id ?? null;
        if (this.addresses.length === 0 && this.cartItems.length > 0) this.openAddressForm();
        this.loading = false;
        this.updating = false;
        // Pick (or correct) the payment method from what the server offers; COD fee etc. depend on it.
        const methods = this.availablePaymentMethods;
        if (!methods.some(m => m.id === this.paymentMethod)) {
          const next = methods[0]?.id ?? null;
          if (next !== this.paymentMethod) {
            this.paymentMethod = next;
            if (next) this.loadSummary();
          }
        }
      },
      error: err => {
        this.loading = false;
        this.updating = false;
        this.errorMessage = apiErrorMessage(err, 'Could not load your cart. Please try again.');
      }
    });
  }

  // ---------- cart ----------
  updateQuantity(line: QuoteLine, quantity: number): void {
    // The server reports each line's allowed range (min/max order quantity) and enforces it again.
    if (quantity < Math.max(1, line.minQty ?? 1) || quantity > (line.maxQty ?? 99)) return;
    this.afterCartChange(this.cart.setQty(line.productId, line.variantId, quantity));
  }

  removeItem(line: QuoteLine): void {
    this.afterCartChange(this.cart.remove(line.productId, line.variantId));
  }

  clearCart(): void {
    this.afterCartChange(this.cart.clear());
  }

  private afterCartChange(op: Observable<unknown>): void {
    this.updating = true;
    op.subscribe({
      next: () => this.loadSummary(),
      error: err => {
        this.updating = false;
        this.toaster.showToast(apiErrorMessage(err), ToastType.Error);
        this.loadSummary();
      }
    });
  }

  // ---------- address ----------
  selectAddress(address: Address): void {
    if (address.id === this.selectedAddressId) return;
    this.selectedAddressId = address.id ?? null;
    this.loadSummary(); // tax split (CGST/SGST vs IGST) and shipping depend on the address
  }

  openAddressForm(address?: Address): void {
    this.addressError = '';
    this.editingAddressId = address?.id ?? null;
    const user = this.session.user();
    this.addressForm = address
      ? { ...emptyAddress(), ...address }
      : { ...emptyAddress(), name: user?.name ?? '', phone: user?.phone ?? '', email: user?.email ?? '' };
    this.showAddressForm = true;
  }

  cancelAddressForm(): void {
    this.showAddressForm = false;
    this.editingAddressId = null;
    this.addressError = '';
  }

  saveAddress(): void {
    const a = this.addressForm;
    if (!a.name?.trim() || !a.line1?.trim() || !a.city?.trim() || !a.state?.trim()) {
      this.addressError = 'Please fill in name, address, city and state';
      return;
    }
    if (!/^\d{10}$/.test(a.phone ?? '')) {
      this.addressError = 'Please enter a valid 10-digit mobile number';
      return;
    }
    if (!/^\d{6}$/.test(a.pincode ?? '')) {
      this.addressError = 'Please enter a valid 6-digit pincode';
      return;
    }
    this.savingAddress = true;
    this.addressError = '';
    const body: Address = { ...a, name: a.name.trim(), line1: a.line1.trim(), city: a.city.trim() };
    const req = this.editingAddressId ? this.api.updateAddress(this.editingAddressId, body) : this.api.addAddress(body);
    req.subscribe({
      next: saved => {
        this.savingAddress = false;
        this.showAddressForm = false;
        this.editingAddressId = null;
        this.selectedAddressId = saved.id ?? this.selectedAddressId;
        this.loadSummary();
      },
      error: err => {
        this.savingAddress = false;
        this.addressError = apiErrorMessage(err, 'Could not save the address');
      }
    });
  }

  // ---------- coupon & payment ----------
  applyCoupon(): void {
    const code = this.couponInput.trim().toUpperCase();
    if (!code) return;
    this.couponCode = code;
    this.loadSummary();
  }

  removeCoupon(): void {
    this.couponCode = null;
    this.couponInput = '';
    this.loadSummary();
  }

  /** The coupon the server actually applied (vs. one that was rejected). */
  get couponApplied(): boolean {
    return !!this.quote?.couponCode && (this.quote?.discountPaise ?? 0) > 0;
  }

  selectPaymentMethod(id: PaymentOption['id']): void {
    if (id === this.paymentMethod) return;
    this.paymentMethod = id;
    this.loadSummary(); // COD fee depends on the method
  }

  navigateToAccount(): void {
    this.router.navigate(['/account']);
  }

  proceedToPayment(): void {
    if (!this.selectedAddressId) {
      this.toast('Please select a delivery address', ToastType.Warn);
      return;
    }
    if (!this.paymentMethod) {
      this.toast('Please choose a payment method', ToastType.Warn);
      return;
    }
    if (!this.quote?.canCheckout) {
      this.toast('Please review the issues in your cart before paying', ToastType.Warn);
      return;
    }
    this.placing = true;
    this.api.placeOrder({
      addressId: this.selectedAddressId,
      paymentMethod: this.paymentMethod,
      couponCode: this.couponApplied ? this.quote.couponCode : undefined,
    }).subscribe({
      next: async ({ order, payment }) => {
        // The server has emptied the cart; reflect that locally.
        this.cart.refresh().subscribe({ error: () => undefined });
        if (payment.type !== 'none' && payment.type !== 'error') {
          this.toast('Redirecting to payment gateway', ToastType.Info);
        }
        try {
          await this.launcher.launch(order.id, payment);
        } catch (err) {
          console.error('Payment could not be started', err);
          // The order exists; the result page offers "retry payment".
          this.router.navigate(['/payment-response'], { queryParams: { orderId: order.id } });
        }
      },
      error: err => {
        this.placing = false;
        this.toast(apiErrorMessage(err, 'Could not place your order. Please try again.'), ToastType.Error);
        this.loadSummary();
      }
    });
  }

  private toast(message: string, type: ToastType): void {
    this.toaster.showToast(message, type, 4000);
  }
}
