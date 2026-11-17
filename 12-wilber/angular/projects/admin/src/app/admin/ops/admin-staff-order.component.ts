import { Component, EventEmitter, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { AdminOpsApi, CustomerLookup, StaffOrderRequest } from '../../core/admin-ops-api';
import { Address, Order, Quote } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { INDIAN_STATES } from './ops-shared';
import { PickedVariant } from './product-picker.component';
import { ProductCardsComponent } from './product-cards.component';

interface CartRow { productId: string; variantId: string; name: string; variantName: string; pricePaise: number; qty: number; stock?: number; thumbnail?: string; }

/** Staff places an order for a customer (phone / WhatsApp / walk-in): customer → items → server quote → payment. */
@Component({
  selector: 'app-admin-staff-order',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe, ProductCardsComponent],
  styles: [`
    .so { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 18px; align-items: start; }
    .so-left { min-width: 0; }
    /* right pane stays in view and scrolls on its own when taller than the screen */
    .so-right { position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow-y: auto; padding-right: 2px; }
    @media (max-width: 1199px) {
      .so { grid-template-columns: 1fr; }
      .so-right { position: static; max-height: none; overflow: visible; }
    }
    .so-thumb { width: 34px; height: 34px; object-fit: contain; border: 1px solid #e6e9ee; border-radius: 6px; background: #f7f9fb; flex: none; }
  `],
  template: `
  <div *ngIf="placed" class="alert alert-success d-flex align-items-center gap-3">
    <div><i class="fas fa-check-circle me-1"></i>Order <code>{{ placed.id }}</code> placed for {{ placed.customer.name }} — {{ placed.totalPaise | money }}
      <span *ngIf="placed.invoiceNumber"> · invoice {{ placed.invoiceNumber }}</span></div>
    <button class="btn btn-sm btn-outline-success ms-auto" (click)="openOrder.emit(placed.id)">View order</button>
    <button class="btn btn-sm btn-success" (click)="reset()">New order</button>
  </div>

  <div class="so" *ngIf="!placed">
    <!-- ===== LEFT: product cards (big, with photos, category chips) ===== -->
    <div class="so-left">
      <div class="card"><div class="card-body">
        <h6 class="card-title mb-3"><i class="fas fa-th-large me-1 text-primary"></i>2. Products
          <small class="text-muted fw-normal ms-2">click a pack size to add it to the order</small></h6>
        <app-product-cards #picker cartLabel="order" [inCart]="inCart" (picked)="add($event)"></app-product-cards>
      </div></div>
    </div>

    <!-- ===== RIGHT: customer, order lines, payment, total (sticky) ===== -->
    <div class="so-right">
      <div class="card mb-3"><div class="card-body">
        <h6 class="card-title"><i class="fas fa-user me-1"></i>1. Customer</h6>
        <div class="input-group mb-2">
          <input class="form-control" [(ngModel)]="phone" placeholder="Mobile number (10 digits)" maxlength="14" (keyup.enter)="lookup()">
          <button class="btn btn-outline-primary" (click)="lookup()" [disabled]="looking">Find</button>
        </div>
        <div *ngIf="customer" class="small mb-2">
          <span *ngIf="customer.found" class="text-success"><i class="fas fa-user-check me-1"></i>Existing customer {{ customer.user?.name }}</span>
          <span *ngIf="!customer.found" class="text-primary"><i class="fas fa-user-plus me-1"></i>New customer — will be created</span>
        </div>
        <div class="row g-2" *ngIf="customer">
          <div class="col-md-6"><input class="form-control form-control-sm" [(ngModel)]="name" placeholder="Name *"></div>
          <div class="col-md-6"><input class="form-control form-control-sm" [(ngModel)]="email" placeholder="Email (optional)"></div>
        </div>
        <div *ngIf="customer" class="mt-3">
          <label class="form-label small fw-semibold">Delivery address</label>
          <div *ngFor="let a of customer.addresses" class="form-check small">
            <input class="form-check-input" type="radio" name="addr" [value]="a.id" [(ngModel)]="addressId" (change)="requote()">
            <label class="form-check-label">{{ a.name }}, {{ a.line1 }}, {{ a.city }}, {{ a.state }} {{ a.pincode }}</label>
          </div>
          <div class="form-check small">
            <input class="form-check-input" type="radio" name="addr" [value]="''" [(ngModel)]="addressId" (change)="requote()">
            <label class="form-check-label">New address</label>
          </div>
          <div class="row g-2 mt-1" *ngIf="!addressId">
            <div class="col-12"><input class="form-control form-control-sm" [(ngModel)]="addr.line1" placeholder="Address line 1 *"></div>
            <div class="col-md-6"><input class="form-control form-control-sm" [(ngModel)]="addr.line2" placeholder="Line 2"></div>
            <div class="col-md-6"><input class="form-control form-control-sm" [(ngModel)]="addr.landmark" placeholder="Landmark"></div>
            <div class="col-md-4"><input class="form-control form-control-sm" [(ngModel)]="addr.city" placeholder="City *"></div>
            <div class="col-md-4"><select class="form-select form-select-sm" [(ngModel)]="addr.state" (change)="requote()">
              <option value="">State *</option><option *ngFor="let s of states" [value]="s">{{ s }}</option></select></div>
            <div class="col-md-4"><input class="form-control form-control-sm" [(ngModel)]="addr.pincode" maxlength="6" placeholder="Pincode *"></div>
            <div class="col-md-6"><input class="form-control form-control-sm" [(ngModel)]="addr.gstin" maxlength="15" placeholder="GSTIN (B2B, optional)"></div>
          </div>
        </div>
      </div></div>

      <div class="card mb-3"><div class="card-body">
        <h6 class="card-title"><i class="fas fa-shopping-basket me-1"></i>Order lines
          <span *ngIf="rows.length" class="badge bg-primary ms-1">{{ rows.length }}</span></h6>
        <div *ngIf="!rows.length" class="text-muted small">Click a pack size on a product card to add it.</div>
        <table class="table table-sm align-middle" *ngIf="rows.length">
          <thead><tr><th>Item</th><th style="width:80px">Qty</th><th class="text-end">Price</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let r of rows; let i = index">
              <td class="small"><div class="d-flex align-items-center gap-2">
                <img *ngIf="r.thumbnail" [src]="r.thumbnail" alt="" class="so-thumb">
                <div>{{ r.name }} <span class="text-muted">({{ r.variantName }})</span></div></div>
                <div *ngIf="r.stock !== undefined" class="text-muted" [class.text-danger]="r.qty > (r.stock ?? 0)">stock {{ r.stock }}</div></td>
              <td><input type="number" min="1" max="9999" class="form-control form-control-sm" [(ngModel)]="r.qty" (ngModelChange)="requote()"></td>
              <td class="text-end small">{{ r.pricePaise * r.qty | money }}</td>
              <td><button class="btn btn-sm btn-link text-danger" (click)="rows.splice(i, 1); requote()"><i class="fas fa-trash"></i></button></td>
            </tr>
          </tbody>
        </table>
        <div class="input-group input-group-sm" style="max-width:300px">
          <input class="form-control" [(ngModel)]="couponCode" placeholder="Coupon (optional)" (change)="requote()">
          <button class="btn btn-outline-secondary" (click)="requote()">Apply</button>
        </div>
      </div></div>

      <div class="card mb-3"><div class="card-body">
        <h6 class="card-title"><i class="fas fa-rupee-sign me-1"></i>3. Payment</h6>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" name="pm" value="cod" [(ngModel)]="method" (change)="requote()"><label class="form-check-label">Cash on delivery</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" name="pm" value="offline" [(ngModel)]="method" (change)="requote()"><label class="form-check-label">Paid offline</label>
        </div>
        <div class="row g-2 mt-1" *ngIf="method === 'offline'">
          <div class="col-md-5"><select class="form-select form-select-sm" [(ngModel)]="mode">
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank transfer</option><option value="cheque">Cheque</option></select></div>
          <div class="col-md-7"><input class="form-control form-control-sm" [(ngModel)]="reference" placeholder="Reference (UTR / cheque no.)"></div>
        </div>
        <input class="form-control form-control-sm mt-2" [(ngModel)]="notes" placeholder="Order notes (optional)" maxlength="500">
      </div></div>

      <div class="card border-primary"><div class="card-body">
        <h6 class="card-title">Server quote <span *ngIf="quoting" class="spinner-border spinner-border-sm ms-1"></span></h6>
        <div *ngIf="!quote" class="text-muted small">Add a customer, address and products to see the price.</div>
        <ng-container *ngIf="quote">
          <table class="table table-sm mb-2"><tbody>
            <tr><td>Subtotal</td><td class="text-end">{{ quote.subtotalPaise | money }}</td></tr>
            <tr *ngIf="quote.discountPaise"><td>Discount {{ quote.couponCode }}</td><td class="text-end">-{{ quote.discountPaise | money }}</td></tr>
            <tr><td>Shipping</td><td class="text-end">{{ quote.shippingPaise | money }}</td></tr>
            <tr *ngIf="quote.codFeePaise"><td>COD fee</td><td class="text-end">{{ quote.codFeePaise | money }}</td></tr>
            <tr *ngIf="quote.cgstPaise"><td>CGST + SGST</td><td class="text-end">{{ quote.cgstPaise + quote.sgstPaise | money }}</td></tr>
            <tr *ngIf="quote.igstPaise"><td>IGST</td><td class="text-end">{{ quote.igstPaise | money }}</td></tr>
            <tr class="fw-bold"><td>Total <small class="text-muted fw-normal" *ngIf="quote.pricesIncludeTax">(incl. GST)</small></td><td class="text-end">{{ quote.totalPaise | money }}</td></tr>
          </tbody></table>
          <div *ngIf="quote.couponMessage && couponCode" class="small" [class.text-danger]="!quote.couponCode">{{ quote.couponMessage }}</div>
        </ng-container>
        <div *ngIf="error" class="alert alert-danger py-2 small mt-2">{{ error }}</div>
        <button class="btn btn-primary w-100 mt-2" (click)="place()" [disabled]="placing || !canPlace()">
          <span *ngIf="placing" class="spinner-border spinner-border-sm me-1"></span>Place order
        </button>
        <div class="small text-muted mt-1">Stock is reserved when the order is placed; the customer gets the usual SMS/email.</div>
      </div></div>
    </div>
  </div>
  `
})
export class AdminStaffOrderComponent {
  private readonly ops = inject(AdminOpsApi);
  private readonly toaster = inject(ToasterService);
  @Output() openOrder = new EventEmitter<string>();
  @ViewChild('picker') picker?: ProductCardsComponent;

  readonly states = INDIAN_STATES;
  phone = '';
  customer: CustomerLookup | null = null;
  looking = false;
  name = '';
  email = '';
  addressId = '';
  addr: Partial<Address> = { line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', gstin: '' };
  rows: CartRow[] = [];
  couponCode = '';
  method: 'cod' | 'offline' = 'cod';
  mode = 'cash';
  reference = '';
  notes = '';
  quote: Quote | null = null;
  quoting = false;
  placing = false;
  error = '';
  placed: Order | null = null;
  private readonly requote$ = new Subject<void>();

  constructor() {
    this.requote$.pipe(debounceTime(400)).subscribe(() => this.fetchQuote());
  }

  lookup(): void {
    if (!this.phone.trim()) return;
    this.looking = true;
    this.error = '';
    this.ops.lookupCustomer(this.phone.trim()).subscribe({
      next: c => {
        this.looking = false;
        this.customer = c;
        this.phone = c.phone;
        this.name = c.user?.name ?? '';
        this.email = c.user?.email ?? '';
        const def = c.addresses.find(a => a.isDefault) ?? c.addresses[0];
        this.addressId = def?.id ?? '';
        this.requote();
      },
      error: e => { this.looking = false; this.error = apiErrorMessage(e); }
    });
  }

  add(p: PickedVariant): void {
    const existing = this.rows.find(r => r.variantId === p.variant.variantId);
    if (existing) existing.qty++;
    else this.rows.push({ productId: p.product.productId, variantId: p.variant.variantId, name: p.product.name, variantName: p.variant.name,
      pricePaise: p.variant.pricePaise, qty: 1, stock: p.product.stockManaged ? (p.variant.stock ?? 0) : undefined, thumbnail: p.product.thumbnail });
    this.requote();
  }

  /** qty per variant, for the "N in order" badges on the product cards */
  get inCart(): Record<string, number> {
    const m: Record<string, number> = {};
    for (const r of this.rows) m[r.variantId] = (m[r.variantId] ?? 0) + (Number(r.qty) || 0);
    return m;
  }

  requote(): void { this.requote$.next(); }

  private body(): StaffOrderRequest {
    return {
      customer: { phone: this.phone.trim(), name: this.name.trim() || undefined, email: this.email.trim() || undefined },
      addressId: this.addressId || undefined,
      address: this.addressId ? undefined : { ...this.addr, name: this.name.trim(), phone: this.phone.trim(), gstin: this.addr.gstin?.trim() || undefined },
      items: this.rows.filter(r => r.qty > 0).map(r => ({ productId: r.productId, variantId: r.variantId, qty: Math.floor(r.qty) })),
      couponCode: this.couponCode.trim() || undefined,
      payment: this.method === 'offline' ? { method: 'offline', mode: this.mode, reference: this.reference.trim() || undefined } : { method: 'cod' },
      notes: this.notes.trim() || undefined,
    };
  }

  private fetchQuote(): void {
    if (!this.rows.length) { this.quote = null; return; }
    this.quoting = true;
    this.ops.staffQuote(this.body()).subscribe({
      next: q => { this.quote = q; this.quoting = false; this.error = ''; },
      error: e => { this.quoting = false; this.error = apiErrorMessage(e); }
    });
  }

  canPlace(): boolean {
    return !!this.customer && !!this.name.trim() && this.rows.length > 0 && !!this.quote?.canCheckout
      && (!!this.addressId || !!(this.addr.line1 && this.addr.city && this.addr.state && this.addr.pincode));
  }

  place(): void {
    if (!this.canPlace()) return;
    if (!window.confirm(`Place order for ${this.name} — ${this.quote ? (this.quote.totalPaise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) : ''}?`)) return;
    this.placing = true;
    this.error = '';
    this.ops.placeStaffOrder(this.body()).subscribe({
      next: o => {
        this.placing = false;
        this.placed = o;
        this.toaster.showToast('Order ' + o.id + ' placed', ToastType.Success, 3000);
        this.picker?.reload();
      },
      error: e => {
        this.placing = false;
        this.error = apiErrorMessage(e, 'Could not place the order.');
        this.picker?.reload();
        this.fetchQuote();
      }
    });
  }

  reset(): void {
    this.placed = null;
    this.customer = null;
    this.phone = this.name = this.email = this.couponCode = this.reference = this.notes = '';
    this.addressId = '';
    this.addr = { line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', gstin: '' };
    this.rows = [];
    this.quote = null;
    this.method = 'cod';
    setTimeout(() => this.picker?.reload());
  }
}
