import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HeaderComponent } from '../shared/header/header.component';
import { FooterComponent } from '../shared/footer/footer.component';
import { ApiService } from '@shared/core/api.service';
import { SessionService } from '@shared/core/session.service';
import { PaymentLauncherService } from '../core/payment-launcher.service';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { Order } from '@shared/core/models';
import { Quotation } from '@shared/core/documents';
import { printHtmlDocument } from '@shared/core/print-doc';

const GATEWAY_LABEL: Record<string, string> = { razorpay: 'Razorpay (UPI / cards / netbanking)', phonepe: 'PhonePe', ccavenue: 'CCAvenue' };

/**
 * Customer view of a quotation sent by the store: /quote/:id?k=<access key>. Accepting or rejecting requires an
 * OTP login with the mobile number the quotation was sent to (done inline). Accepting creates the order.
 */
@Component({
  selector: 'app-quote-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, FooterComponent, MoneyPipe],
  template: `
  <app-header></app-header>
  <div class="container py-4" style="max-width:960px">
    <div *ngIf="loading" class="text-center py-5"><span class="spinner-border text-primary"></span></div>
    <div *ngIf="!loading && !quote" class="alert alert-warning">{{ error || 'This quotation link is not valid. Please contact the store.' }}</div>

    <ng-container *ngIf="quote">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h3 class="mb-0">Quotation {{ quote.displayNumber }}</h3>
        <span class="badge" [class.bg-primary]="quote.status === 'SENT'" [class.bg-success]="quote.status === 'ACCEPTED'"
              [class.bg-secondary]="quote.status !== 'SENT' && quote.status !== 'ACCEPTED'">{{ statusText() }}</span>
        <button class="btn btn-sm btn-outline-secondary ms-auto" (click)="print()"><i class="fas fa-print me-1"></i>Print / save PDF</button>
      </div>

      <div *ngIf="placedOrder || quote.status === 'ACCEPTED'" class="alert alert-success">
        <i class="fas fa-check-circle me-1"></i>Thank you — your order <strong>{{ placedOrder?.id || quote.orderId }}</strong> has been placed.
        <a routerLink="/orders" class="ms-1">View my orders</a>
      </div>
      <div *ngIf="quote.status === 'REVISED'" class="alert alert-info">This quotation has been updated. Please use the latest link the store sent you.</div>
      <div *ngIf="quote.status === 'EXPIRED' || (quote.status === 'SENT' && !quote.canRespond)" class="alert alert-warning">
        This quotation expired on {{ quote.validUntil | date:'d MMM y' }}. Please contact {{ quote.store?.name }} for a fresh quote.</div>
      <div *ngIf="quote.status === 'REJECTED'" class="alert alert-secondary">This quotation was declined.</div>

      <div class="card mb-3"><div class="card-body p-0">
        <iframe title="Quotation" [srcdoc]="docHtml" style="width:100%;height:720px;border:0" sandbox=""></iframe>
      </div></div>

      <div class="card" *ngIf="quote.canRespond && !placedOrder"><div class="card-body">
        <h5>Total {{ quote.totalPaise | money }} <small class="text-muted">· valid until {{ quote.validUntil | date:'d MMM y' }}</small></h5>

        <ng-container *ngIf="!loggedInAsCustomer()">
          <p class="mb-2">To accept or decline, verify your mobile number <strong>{{ maskedPhone() }}</strong>.</p>
          <div class="row g-2" style="max-width:520px">
            <div class="col-7"><input class="form-control" [(ngModel)]="phone" placeholder="Mobile number" maxlength="10" inputmode="numeric"></div>
            <div class="col-5"><button class="btn btn-outline-primary w-100" (click)="sendOtp()" [disabled]="busy">{{ otpSent ? 'Resend OTP' : 'Send OTP' }}</button></div>
            <ng-container *ngIf="otpSent">
              <div class="col-7"><input class="form-control" [(ngModel)]="otp" placeholder="6-digit OTP" maxlength="6" inputmode="numeric"></div>
              <div class="col-5"><button class="btn btn-primary w-100" (click)="verifyOtp()" [disabled]="busy || otp.length !== 6">Verify</button></div>
            </ng-container>
          </div>
          <div *ngIf="session.isLoggedIn() && !loggedInAsCustomer()" class="small text-danger mt-2">
            You are logged in with a different number. Verify the number this quotation was sent to.</div>
        </ng-container>

        <ng-container *ngIf="loggedInAsCustomer()">
          <div *ngIf="quote.paymentMethod === 'online'" class="mb-2">
            <label class="form-label">Pay with</label>
            <select class="form-select" style="max-width:360px" [(ngModel)]="gateway">
              <option *ngFor="let g of quote.onlineGateways" [value]="g">{{ gatewayLabel(g) }}</option></select>
          </div>
          <p *ngIf="quote.paymentMethod === 'cod'" class="text-muted">Payment: cash on delivery.</p>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-success" (click)="accept()" [disabled]="busy">
              <span *ngIf="busy" class="spinner-border spinner-border-sm me-1"></span>Accept &amp; place order</button>
            <button class="btn btn-outline-danger" (click)="showReject = !showReject" [disabled]="busy">Decline</button>
          </div>
          <div *ngIf="showReject" class="mt-2" style="max-width:520px">
            <input class="form-control mb-2" [(ngModel)]="rejectReason" placeholder="Reason (optional)">
            <button class="btn btn-sm btn-danger" (click)="reject()" [disabled]="busy">Confirm decline</button>
          </div>
        </ng-container>
        <div *ngIf="devOtp" class="small text-muted mt-2">Dev OTP: {{ devOtp }}</div>
        <div *ngIf="error" class="alert alert-danger mt-3 mb-0">{{ error }}</div>
      </div></div>
      <p class="small text-muted mt-3">Questions? Contact {{ quote.store?.name }} {{ quote.store?.supportPhone ? '· ' + quote.store?.supportPhone : '' }}
        {{ quote.store?.supportEmail ? '· ' + quote.store?.supportEmail : '' }}</p>
    </ng-container>
  </div>
  <app-footer></app-footer>
  `
})
export class QuoteViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly launcher = inject(PaymentLauncherService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly session = inject(SessionService);

  id = '';
  key = '';
  quote: Quotation | null = null;
  docHtml: SafeHtml = '';
  loading = true;
  busy = false;
  error = '';
  phone = '';
  otp = '';
  otpSent = false;
  devOtp = '';
  gateway = '';
  showReject = false;
  rejectReason = '';
  placedOrder: Order | null = null;

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.key = this.route.snapshot.queryParamMap.get('k') ?? '';
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.api.publicQuote(this.id, this.key).subscribe({
      next: q => this.setQuote(q),
      error: e => { this.loading = false; this.error = e?.status === 404 ? '' : apiErrorMessage(e); }
    });
  }

  private setQuote(q: Quotation): void {
    this.quote = q;
    // Server-rendered, fully escaped document shown in a sandboxed iframe (no scripts run).
    this.docHtml = this.sanitizer.bypassSecurityTrustHtml(q.html ?? '');
    this.phone = this.phone || (q.customer?.phone ?? '');
    this.gateway = this.gateway || (q.onlineGateways?.[0] ?? '');
    this.loading = false;
  }

  statusText(): string {
    const s = this.quote?.status;
    return s === 'SENT' ? 'Awaiting your response' : s === 'ACCEPTED' ? 'Accepted' : s === 'REJECTED' ? 'Declined' : s === 'EXPIRED' ? 'Expired' : s === 'REVISED' ? 'Superseded' : (s ?? '');
  }

  maskedPhone(): string {
    const p = this.quote?.customer?.phone ?? '';
    return p.length === 10 ? p.slice(0, 2) + '••••••' + p.slice(8) : p;
  }

  loggedInAsCustomer(): boolean {
    return this.session.isLoggedIn() && this.session.user()?.phone === this.quote?.customer?.phone;
  }

  gatewayLabel(g: string): string { return GATEWAY_LABEL[g] ?? g; }

  sendOtp(): void {
    this.busy = true;
    this.error = '';
    this.api.requestOtp(this.phone.trim()).subscribe({
      next: r => { this.busy = false; this.otpSent = true; this.devOtp = r.devOtp ?? ''; },
      error: e => { this.busy = false; this.error = apiErrorMessage(e); }
    });
  }

  verifyOtp(): void {
    this.busy = true;
    this.error = '';
    this.api.verifyOtp(this.phone.trim(), this.otp.trim()).subscribe({
      next: () => {
        this.busy = false;
        this.otp = '';
        this.devOtp = '';
        if (!this.loggedInAsCustomer()) this.error = 'This quotation was sent to a different mobile number.';
      },
      error: e => { this.busy = false; this.error = apiErrorMessage(e); }
    });
  }

  accept(): void {
    if (!this.quote) return;
    this.busy = true;
    this.error = '';
    const pm = this.quote.paymentMethod === 'online' ? this.gateway || undefined : 'cod';
    this.api.customerAcceptQuote(this.id, this.key, pm).subscribe({
      next: async r => {
        this.placedOrder = r.order;
        this.setQuote(r.quote);
        this.busy = false;
        if (r.payment && r.payment.type !== 'none') {
          if (r.payment.type === 'error') this.error = (r.payment.message ?? 'Payment could not start') + ' — you can pay from My Orders.';
          else await this.launcher.launch(r.order.id, r.payment);
        }
      },
      error: e => { this.busy = false; this.error = apiErrorMessage(e, 'Could not accept the quotation.'); this.load(); }
    });
  }

  reject(): void {
    this.busy = true;
    this.api.customerRejectQuote(this.id, this.key, this.rejectReason.trim() || undefined).subscribe({
      next: q => { this.busy = false; this.setQuote(q); },
      error: e => { this.busy = false; this.error = apiErrorMessage(e); }
    });
  }

  print(): void {
    if (this.quote?.html && !printHtmlDocument(this.quote.html)) window.alert('Please allow pop-ups to print.');
  }
}
