import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AdminApi } from '../core/admin-api';
import { AdminOpsApi } from '../core/admin-ops-api';
import { Order } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { WebImgPipe } from './m-img.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { printHtmlDocument } from '@shared/core/print-doc';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { NEXT_STATUS, paymentLabel, statusLabel, statusTone, telHref, waHref } from './m-common';

/** One order: call/WhatsApp the customer, items and totals, move it to the next status, invoice. */
@Component({
  selector: 'app-m-order',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MoneyPipe, WebImgPipe],
  template: `
  <div class="m-page" *ngIf="o; else loadingTpl">
    <section class="m-sheet">
      <div class="m-card-top"><b class="fs-5">{{ o.totalPaise | money }}</b><span class="m-pill" [ngClass]="tone(o.status)">{{ label(o.status) }}</span></div>
      <div class="m-card-sub">#{{ o.id }} · {{ o.createdAt | date:'d MMM y, h:mm a' }}</div>
      <div class="m-card-tags mt-2">
        <span *ngIf="o.paymentMethod !== 'cod'" class="m-pill muted">{{ o.paymentMethod === 'offline' ? 'Paid offline' : o.paymentMethod }}</span>
        <span class="m-pill" [ngClass]="o.paymentStatus === 'PAID' || o.paymentStatus === 'COD_COLLECTED' ? 'ok' : 'muted'">{{ pay(o.paymentStatus) }}</span>
        <span *ngIf="o.channel === 'ADMIN'" class="m-pill muted">Placed by staff</span>
        <span *ngIf="o.invoiceNumber" class="m-pill muted">Invoice {{ o.invoiceNumber }}</span>
      </div>
    </section>

    <section class="m-sheet">
      <h3 class="m-sheet-h">Customer</h3>
      <div><b>{{ o.shippingAddress.name || o.customer.name }}</b></div>
      <div class="m-muted">{{ o.shippingAddress.line1 }}<span *ngIf="o.shippingAddress.line2">, {{ o.shippingAddress.line2 }}</span><br>
        {{ o.shippingAddress.city }}, {{ o.shippingAddress.state }} {{ o.shippingAddress.pincode }}</div>
      <div class="m-btn-row mt-2">
        <a class="m-btn ghost" [href]="tel(o.shippingAddress.phone || o.customer.phone)"><i class="fas fa-phone"></i>Call</a>
        <a class="m-btn ghost" [href]="wa(o.shippingAddress.phone || o.customer.phone)" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i>WhatsApp</a>
      </div>
    </section>

    <section class="m-sheet">
      <h3 class="m-sheet-h">Items</h3>
      <div *ngFor="let l of o.lines" class="m-line">
        <img *ngIf="l.image" [src]="l.image | webImg" alt="">
        <div class="m-line-main"><b>{{ l.name }}</b><small>{{ l.variantName }} · {{ l.qty }} × {{ l.unitPricePaise | money }}</small></div>
        <b>{{ l.lineTotalPaise | money }}</b>
      </div>
      <dl class="m-totals">
        <dt>Subtotal</dt><dd>{{ o.subtotalPaise | money }}</dd>
        <ng-container *ngIf="o.discountPaise"><dt>Discount</dt><dd>−{{ o.discountPaise | money }}</dd></ng-container>
        <ng-container *ngIf="o.shippingPaise"><dt>Shipping</dt><dd>{{ o.shippingPaise | money }}</dd></ng-container>
        <ng-container *ngIf="o.codFeePaise"><dt>COD fee</dt><dd>{{ o.codFeePaise | money }}</dd></ng-container>
        <ng-container *ngIf="o.taxPaise"><dt>GST {{ o.pricesIncludeTax ? '(included)' : '' }}</dt><dd>{{ o.taxPaise | money }}</dd></ng-container>
        <dt class="total">Total</dt><dd class="total">{{ o.totalPaise | money }}</dd>
      </dl>
      <div *ngIf="o.notes" class="m-note"><i class="fas fa-sticky-note me-1"></i>{{ o.notes }}</div>
    </section>

    <section class="m-sheet" *ngIf="next.length">
      <h3 class="m-sheet-h">Move to</h3>
      <div class="m-chips wrap">
        <button *ngFor="let s of next" [class.on]="newStatus === s" [class.danger]="s === 'CANCELLED' || s === 'RETURNED'" (click)="newStatus = s">{{ label(s) }}</button>
      </div>
      <ng-container *ngIf="newStatus">
        <ng-container *ngIf="newStatus === 'DISPATCHED'">
          <label class="m-label">Courier</label><input class="m-input" [(ngModel)]="courier" placeholder="e.g. DTDC">
          <label class="m-label">AWB / tracking no.</label><input class="m-input" [(ngModel)]="awb">
          <label class="m-label">Tracking link (optional)</label><input class="m-input" type="url" [(ngModel)]="trackingUrl">
        </ng-container>
        <label class="m-label">Note (optional)</label><input class="m-input" [(ngModel)]="note">
        <button class="m-btn primary block mt-3" [disabled]="busy" (click)="applyStatus()">
          <span *ngIf="busy" class="spinner-border spinner-border-sm"></span> Mark as {{ label(newStatus) }}</button>
      </ng-container>
    </section>

    <section class="m-sheet">
      <div class="m-btn-row">
        <button class="m-btn ghost" (click)="invoice()" [disabled]="busy"><i class="fas fa-file-invoice"></i>{{ o.invoiceNumber ? 'Invoice' : 'Issue invoice' }}</button>
        <button *ngIf="o.paymentStatus === 'REFUND_PENDING'" class="m-btn ghost" (click)="refunded()" [disabled]="busy"><i class="fas fa-undo"></i>Mark refunded</button>
      </div>
      <a *ngIf="o.shipment?.trackingUrl" class="m-btn ghost block mt-2" [href]="o.shipment?.trackingUrl" target="_blank" rel="noopener">
        <i class="fas fa-truck"></i>Track {{ o.shipment?.courier }} {{ o.shipment?.awb }}</a>
    </section>

    <section class="m-sheet" *ngIf="o.history?.length">
      <h3 class="m-sheet-h">History</h3>
      <ol class="m-timeline">
        <li *ngFor="let h of o.history.slice().reverse()"><b>{{ label(h.status) }}</b>
          <small>{{ h.at | date:'d MMM, h:mm a' }}<span *ngIf="h.by"> · {{ h.by }}</span></small>
          <div *ngIf="h.note" class="m-muted">{{ h.note }}</div></li>
      </ol>
    </section>
  </div>
  <ng-template #loadingTpl>
    <div class="m-page"><div *ngIf="error" class="m-alert bad">{{ error }}</div>
      <div *ngIf="!error" class="m-loading"><span class="spinner-border"></span></div></div>
  </ng-template>
  `
})
export class MOrderComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly ops = inject(AdminOpsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly toaster = inject(ToasterService);
  readonly label = statusLabel;
  readonly tone = statusTone;
  readonly pay = paymentLabel;
  readonly tel = telHref;
  readonly wa = waHref;

  o: Order | null = null;
  error = '';
  busy = false;
  newStatus = '';
  note = '';
  courier = '';
  awb = '';
  trackingUrl = '';

  get next(): string[] { return this.o ? NEXT_STATUS[this.o.status] ?? [] : []; }

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => this.load(p.get('id') ?? ''));
  }

  private load(id: string): void {
    this.o = null;
    this.api.admin.order(id).subscribe({
      next: o => { this.o = o; this.courier = o.shipment?.courier ?? ''; this.awb = o.shipment?.awb ?? ''; },
      error: e => (this.error = apiErrorMessage(e, 'Could not load the order'))
    });
  }

  applyStatus(): void {
    if (!this.o || !this.newStatus) return;
    if ((this.newStatus === 'CANCELLED' || this.newStatus === 'RETURNED') && !confirm(`Mark this order as ${this.label(this.newStatus)}?`)) return;
    this.busy = true;
    this.api.admin.setOrderStatus(this.o.id, {
      status: this.newStatus, note: this.note || undefined,
      courier: this.courier || undefined, awb: this.awb || undefined, trackingUrl: this.trackingUrl || undefined,
    }).subscribe({
      next: o => { this.o = o; this.busy = false; this.newStatus = ''; this.note = ''; this.toaster.showToast('Status updated', ToastType.Success); },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e, 'Could not update the status'), ToastType.Error, 4000); }
    });
  }

  invoice(): void {
    if (!this.o) return;
    this.busy = true;
    const call = this.o.invoiceNumber ? this.ops.orderInvoice(this.o.id) : this.ops.issueInvoice(this.o.id);
    call.subscribe({
      next: v => {
        this.busy = false;
        if (this.o && !this.o.invoiceNumber) this.o.invoiceNumber = v.invoice?.number;
        if (!printHtmlDocument(v.html, false)) this.toaster.showToast('Allow pop-ups to open the invoice', ToastType.Warn, 4000);
      },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e, 'Could not open the invoice'), ToastType.Error, 4000); }
    });
  }

  refunded(): void {
    if (!this.o || !confirm('Mark the refund as done?')) return;
    this.busy = true;
    this.api.admin.markRefunded(this.o.id).subscribe({
      next: o => { this.o = o; this.busy = false; },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}
