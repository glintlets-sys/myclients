import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminOpsApi, CustomerLookup, PickerProduct, PickerVariant, StaffOrderRequest } from '../core/admin-ops-api';
import { Address, Quote } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { WebImgPipe } from './m-img.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

interface Line { product: PickerProduct; variant: PickerVariant; qty: number; }

/**
 * Phone order in four steps (one screen each, big touch targets): customer → products → payment → review & place.
 * The server prices the order (quote) before it is placed, exactly like the desktop Place Order screen.
 */
@Component({
  selector: 'app-m-new-order',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe, WebImgPipe],
  template: `
  <div class="m-page has-sticky">
    <ol class="m-steps">
      <li *ngFor="let s of steps; let i = index" [class.on]="step === i" [class.done]="step > i" (click)="go(i)">{{ s }}</li>
    </ol>

    <!-- 1. customer -->
    <ng-container *ngIf="step === 0">
      <label class="m-label">Customer mobile</label>
      <div class="m-inline">
        <input class="m-input" type="tel" inputmode="numeric" maxlength="14" [(ngModel)]="phone" placeholder="10-digit mobile" (keyup.enter)="find()">
        <button class="m-btn primary" (click)="find()" [disabled]="busy">Find</button>
      </div>
      <ng-container *ngIf="lookup">
        <div class="m-alert" [ngClass]="lookup.found ? 'ok' : 'info'">
          {{ lookup.found ? 'Existing customer: ' + (lookup.user?.name || lookup.phone) : 'New customer — enter the details below.' }}</div>
        <label class="m-label">Name</label><input class="m-input" [(ngModel)]="name">
        <label class="m-label">Email (optional)</label><input class="m-input" type="email" [(ngModel)]="email">
        <h3 class="m-sheet-h mt-3">Deliver to</h3>
        <label *ngFor="let a of lookup.addresses" class="m-radio-card" [class.on]="addressId === a.id">
          <input type="radio" name="addr" [value]="a.id" [(ngModel)]="addressId">
          <div><b>{{ a.name }}</b><small>{{ a.line1 }}, {{ a.city }} {{ a.pincode }}</small></div>
        </label>
        <label class="m-radio-card" [class.on]="addressId === ''">
          <input type="radio" name="addr" value="" [(ngModel)]="addressId"><div><b>New address</b></div></label>
        <div *ngIf="addressId === ''" class="m-form">
          <input class="m-input" [(ngModel)]="addr.line1" placeholder="Address line 1">
          <input class="m-input" [(ngModel)]="addr.line2" placeholder="Address line 2 (optional)">
          <div class="m-inline"><input class="m-input" [(ngModel)]="addr.city" placeholder="City">
            <input class="m-input" inputmode="numeric" maxlength="6" [(ngModel)]="addr.pincode" placeholder="PIN"></div>
          <input class="m-input" [(ngModel)]="addr.state" placeholder="State">
        </div>
      </ng-container>
    </ng-container>

    <!-- 2. products -->
    <ng-container *ngIf="step === 1">
      <div class="m-search"><i class="fas fa-search"></i><input type="search" [(ngModel)]="q" placeholder="Search product, code or SKU"></div>
      <div *ngIf="loadingProducts" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>
      <div class="m-list">
        <div *ngFor="let p of shown" class="m-card">
          <div class="m-prod">
            <img *ngIf="p.thumbnail; else noImg" [src]="p.thumbnail | webImg" alt="" loading="lazy"><ng-template #noImg><i class="fas fa-box-open"></i></ng-template>
            <div><b>{{ p.name }}</b><small *ngIf="p.code">{{ p.code }}</small></div>
          </div>
          <div *ngFor="let v of p.variants" class="m-variant">
            <div><b>{{ v.name }}</b> · {{ v.pricePaise | money }}
              <small *ngIf="p.stockManaged" [class.text-danger]="(v.stock ?? 0) <= 0"> · {{ (v.stock ?? 0) > 0 ? v.stock + ' in stock' : 'out of stock' }}</small></div>
            <div class="m-stepper">
              <button (click)="add(p, v, -1)" [disabled]="!qtyOf(v)" aria-label="Less"><i class="fas fa-minus"></i></button>
              <span>{{ qtyOf(v) }}</span>
              <button (click)="add(p, v, 1)" aria-label="More"><i class="fas fa-plus"></i></button>
            </div>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- 3. payment -->
    <ng-container *ngIf="step === 2">
      <label class="m-radio-card" [class.on]="method === 'cod'"><input type="radio" name="pm" value="cod" [(ngModel)]="method">
        <div><b>Cash on delivery</b></div></label>
      <label class="m-radio-card" [class.on]="method === 'offline'"><input type="radio" name="pm" value="offline" [(ngModel)]="method">
        <div><b>Paid offline</b><small>UPI, bank transfer, cheque…</small></div></label>
      <ng-container *ngIf="method === 'offline'">
        <label class="m-label">Mode</label>
        <select class="m-input" [(ngModel)]="payMode"><option value="upi">UPI</option><option value="bank">Bank transfer</option>
          <option value="cash">Cash</option><option value="cheque">Cheque</option></select>
        <label class="m-label">Reference</label><input class="m-input" [(ngModel)]="payRef" placeholder="UTR / receipt no.">
      </ng-container>
      <label class="m-label">Coupon (optional)</label><input class="m-input" [(ngModel)]="coupon">
      <label class="m-label">Order notes (optional)</label><textarea class="m-input" rows="2" [(ngModel)]="notes"></textarea>
    </ng-container>

    <!-- 4. review -->
    <ng-container *ngIf="step === 3">
      <div *ngIf="busy && !quote" class="m-loading"><span class="spinner-border"></span></div>
      <section class="m-sheet" *ngIf="quote">
        <div><b>{{ name || phone }}</b> · {{ phone }}</div>
        <div *ngFor="let l of quote.lines" class="m-line">
          <div class="m-line-main"><b>{{ l.name }}</b><small>{{ l.variantName }} · {{ l.qty }} × {{ l.unitPricePaise | money }}</small></div>
          <b>{{ l.lineTotalPaise | money }}</b>
        </div>
        <dl class="m-totals">
          <dt>Subtotal</dt><dd>{{ quote.subtotalPaise | money }}</dd>
          <ng-container *ngIf="quote.discountPaise"><dt>Discount</dt><dd>−{{ quote.discountPaise | money }}</dd></ng-container>
          <ng-container *ngIf="quote.shippingPaise"><dt>Shipping</dt><dd>{{ quote.shippingPaise | money }}</dd></ng-container>
          <ng-container *ngIf="quote.codFeePaise"><dt>COD fee</dt><dd>{{ quote.codFeePaise | money }}</dd></ng-container>
          <dt class="total">Total</dt><dd class="total">{{ quote.totalPaise | money }}</dd>
        </dl>
        <div *ngIf="quote.couponMessage" class="m-note">{{ quote.couponMessage }}</div>
        <div *ngFor="let i of quote.issues" class="m-alert bad">{{ i }}</div>
      </section>
    </ng-container>

    <div class="m-sticky">
      <div class="m-sticky-sum" *ngIf="lines.length"><span>{{ count }} item{{ count === 1 ? '' : 's' }}</span><b>{{ estimate | money }}</b></div>
      <button *ngIf="step < 3" class="m-btn primary block" (click)="nextStep()" [disabled]="busy">Continue</button>
      <button *ngIf="step === 3" class="m-btn primary block" (click)="place()" [disabled]="busy || !quote || !!quote.issues.length">
        <span *ngIf="busy" class="spinner-border spinner-border-sm"></span> Place order</button>
    </div>
  </div>
  `
})
export class MNewOrderComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  private readonly router = inject(Router);
  private readonly toaster = inject(ToasterService);
  readonly steps = ['Customer', 'Products', 'Payment', 'Review'];
  step = 0;
  busy = false;

  phone = '';
  lookup: CustomerLookup | null = null;
  name = '';
  email = '';
  addressId: string | undefined = undefined;
  addr: Partial<Address> = {};

  all: PickerProduct[] = [];
  q = '';
  loadingProducts = false;
  lines: Line[] = [];

  method: 'cod' | 'offline' = 'cod';
  payMode = 'upi';
  payRef = '';
  coupon = '';
  notes = '';
  quote: Quote | null = null;

  get shown(): PickerProduct[] {
    const n = this.q.trim().toLowerCase();
    const list = n ? this.all.filter(p => p.name.toLowerCase().includes(n) || (p.code ?? '').toLowerCase().includes(n)
      || p.variants.some(v => (v.sku ?? '').toLowerCase().includes(n))) : this.all;
    return list.slice(0, 40);
  }
  get count(): number { return this.lines.reduce((s, l) => s + l.qty, 0); }
  get estimate(): number { return this.quote?.totalPaise ?? this.lines.reduce((s, l) => s + l.qty * l.variant.pricePaise, 0); }

  ngOnInit(): void {
    this.loadingProducts = true;
    this.ops.catalogPicker().subscribe({
      next: r => { this.all = r.products; this.loadingProducts = false; },
      error: () => (this.loadingProducts = false)
    });
  }

  find(): void {
    const d = this.phone.replace(/\D/g, '').slice(-10);
    if (d.length !== 10) { this.toaster.showToast('Enter a 10-digit mobile number', ToastType.Warn); return; }
    this.phone = d;
    this.busy = true;
    this.ops.lookupCustomer(d).subscribe({
      next: r => {
        this.busy = false;
        this.lookup = r;
        this.name = r.user?.name ?? '';
        this.email = r.user?.email ?? '';
        const def = r.addresses.find(a => a.isDefault) ?? r.addresses[0];
        this.addressId = def?.id ?? '';
      },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }

  qtyOf(v: PickerVariant): number { return this.lines.find(l => l.variant.variantId === v.variantId)?.qty ?? 0; }

  add(p: PickerProduct, v: PickerVariant, delta: number): void {
    const l = this.lines.find(x => x.variant.variantId === v.variantId);
    if (l) { l.qty += delta; if (l.qty <= 0) this.lines = this.lines.filter(x => x !== l); }
    else if (delta > 0) this.lines.push({ product: p, variant: v, qty: 1 });
    this.quote = null;
  }

  go(i: number): void { if (i < this.step) this.step = i; }

  nextStep(): void {
    const problem = this.check(this.step);
    if (problem) { this.toaster.showToast(problem, ToastType.Warn, 3000); return; }
    this.step++;
    if (this.step === 3) this.price();
  }

  private check(step: number): string {
    if (step === 0) {
      if (!this.lookup) return 'Find the customer first';
      if (!this.name.trim()) return 'Enter the customer name';
      if (this.addressId === '' && (!this.addr.line1 || !this.addr.city || !this.addr.pincode || !this.addr.state)) return 'Complete the address';
    }
    if (step === 1 && !this.lines.length) return 'Add at least one product';
    return '';
  }

  private body(): StaffOrderRequest {
    return {
      customer: { phone: this.phone, name: this.name.trim() || undefined, email: this.email.trim() || undefined },
      addressId: this.addressId || undefined,
      address: this.addressId ? undefined : { ...this.addr, name: this.name.trim(), phone: this.phone } as Partial<Address>,
      items: this.lines.map(l => ({ productId: l.product.productId, variantId: l.variant.variantId, qty: l.qty })),
      couponCode: this.coupon.trim() || undefined,
      payment: this.method === 'cod' ? { method: 'cod' } : { method: 'offline', mode: this.payMode, reference: this.payRef || undefined },
      notes: this.notes.trim() || undefined,
    };
  }

  private price(): void {
    this.busy = true;
    this.quote = null;
    this.ops.staffQuote(this.body()).subscribe({
      next: q => { this.quote = q; this.busy = false; },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e, 'Could not price the order'), ToastType.Error, 4000); }
    });
  }

  place(): void {
    this.busy = true;
    this.ops.placeStaffOrder(this.body()).subscribe({
      next: o => { this.busy = false; this.toaster.showToast('Order placed', ToastType.Success); this.router.navigate(['/m/orders', o.id]); },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e, 'Could not place the order'), ToastType.Error, 5000); }
    });
  }
}
