import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';
import { HeaderComponent } from '../shared/header/header.component';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { ApiService } from '@shared/core/api.service';
import { SessionService } from '@shared/core/session.service';
import { CartStoreService } from '../core/cart-store.service';
import { PaymentLauncherService } from '../core/payment-launcher.service';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { Order, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@shared/core/models';

/**
 * Landing page after any payment (and after COD orders). Reads only ?orderId and asks the server for the
 * verified result — any status in the URL is ignored.
 */
@Component({
  selector: 'app-payment-response',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent, MoneyPipe],
  template: `
    <app-header></app-header>
    <div class="container py-5">
      <div class="row justify-content-center">
        <div class="col-md-8">
          <div class="card shadow">
            <div class="card-body text-center p-5">
              <div *ngIf="isLoading" class="mb-4">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Processing payment...</span>
                </div>
                <h5 class="mt-3">Checking your order...</h5>
              </div>

              <div *ngIf="!isLoading">
                <!-- Success State -->
                <div *ngIf="paymentStatus === 'success'" class="text-success">
                  <i class="fas fa-check-circle fa-4x mb-3"></i>
                  <h3 class="mb-3">{{ isCod ? 'Order Placed!' : 'Payment Successful!' }}</h3>
                  <p class="text-muted mb-4">Your order has been placed successfully. You will receive a confirmation shortly.</p>
                  <div class="order-details mb-4" *ngIf="orderId">
                    <h6>Order ID: {{ orderId }}</h6>
                    <div class="text-muted" *ngIf="order">Amount: {{ order.totalPaise | money }} · {{ statusLabel }}</div>
                  </div>
                  <button class="btn btn-primary me-2" (click)="viewOrders()">
                    <i class="fas fa-list me-2"></i>View Orders
                  </button>
                  <button class="btn btn-outline-primary" (click)="continueShopping()">
                    <i class="fas fa-shopping-cart me-2"></i>Continue Shopping
                  </button>
                </div>

                <!-- Failure State -->
                <div *ngIf="paymentStatus === 'failure'" class="text-danger">
                  <i class="fas fa-times-circle fa-4x mb-3"></i>
                  <h3 class="mb-3">{{ order?.status === 'CANCELLED' ? 'Order Cancelled' : 'Payment Failed' }}</h3>
                  <p class="text-muted mb-4">{{ errorMessage || 'Your payment could not be processed. Please try again.' }}</p>
                  <button class="btn btn-primary me-2" *ngIf="canRetry" [disabled]="retrying" (click)="retryPayment()">
                    <i class="fas fa-redo me-2"></i>Retry Payment
                  </button>
                  <button class="btn btn-outline-secondary" (click)="goToCheckout()">
                    <i class="fas fa-arrow-left me-2"></i>Back to Checkout
                  </button>
                </div>

                <!-- Pending State -->
                <div *ngIf="paymentStatus === 'pending'" class="text-warning">
                  <i class="fas fa-clock fa-4x mb-3"></i>
                  <h3 class="mb-3">Payment Pending</h3>
                  <p class="text-muted mb-4">Your payment is being processed. Please wait while we confirm your transaction.</p>
                  <button class="btn btn-primary me-2" (click)="checkPaymentStatus()">
                    <i class="fas fa-sync me-2"></i>Check Status
                  </button>
                  <button class="btn btn-outline-primary" *ngIf="canRetry" [disabled]="retrying" (click)="retryPayment()">
                    <i class="fas fa-redo me-2"></i>Retry Payment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .card {
      border: none;
      border-radius: 15px;
    }
    
    .fa-check-circle {
      color: #28a745;
    }
    
    .fa-times-circle {
      color: #dc3545;
    }
    
    .fa-clock {
      color: #ffc107;
    }
    
    .btn {
      border-radius: 25px;
      padding: 10px 25px;
    }
  `]
})
export class PaymentResponseComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasterService = inject(ToasterService);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly cart = inject(CartStoreService);
  private readonly launcher = inject(PaymentLauncherService);

  isLoading = true;
  retrying = false;
  paymentStatus: 'success' | 'failure' | 'pending' = 'pending';
  orderId: string | null = null;
  order: Order | null = null;
  errorMessage: string | null = null;

  get isCod(): boolean {
    return this.order?.paymentMethod === 'cod';
  }

  get canRetry(): boolean {
    return !!this.order && this.order.status === 'PENDING_PAYMENT' && !this.isCod;
  }

  get statusLabel(): string {
    if (!this.order) return '';
    return `${ORDER_STATUS_LABEL[this.order.status] ?? this.order.status} · ${PAYMENT_STATUS_LABEL[this.order.paymentStatus] ?? this.order.paymentStatus}`;
  }

  ngOnInit(): void {
    this.orderId = this.route.snapshot.queryParamMap.get('orderId');
    if (!this.orderId) {
      this.showError('We could not find your order reference.');
      return;
    }
    if (!this.session.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.checkPaymentStatus();
  }

  /** Loads the order; for online orders still awaiting payment, asks the server to verify with the gateway. */
  checkPaymentStatus(): void {
    if (!this.orderId) return;
    const id = this.orderId;
    this.isLoading = true;
    this.api.order(id).pipe(
      switchMap((o): Observable<Order> =>
        o.paymentMethod !== 'cod' && o.paymentStatus === 'PENDING' ? this.api.verifyPayment(id) : of(o))
    ).subscribe({
      next: order => this.show(order),
      error: err => this.showError(apiErrorMessage(err, 'Unable to check the payment status.'))
    });
  }

  private show(order: Order): void {
    this.order = order;
    this.isLoading = false;
    this.errorMessage = null;
    const paid = order.paymentStatus === 'PAID' || order.paymentStatus === 'COD_PENDING' || order.paymentStatus === 'COD_COLLECTED';
    if (paid && order.status !== 'CANCELLED') {
      this.paymentStatus = 'success';
      this.cart.refresh().subscribe({ error: () => undefined });
    } else if (order.paymentStatus === 'FAILED' || order.status === 'CANCELLED') {
      this.paymentStatus = 'failure';
      this.errorMessage = order.status === 'CANCELLED'
        ? 'This order was cancelled.'
        : 'Your payment could not be processed. Please try again.';
    } else {
      this.paymentStatus = 'pending';
    }
  }

  private showError(message: string): void {
    this.isLoading = false;
    this.paymentStatus = 'failure';
    this.errorMessage = message;
  }

  viewOrders(): void {
    this.router.navigate(['/orders']);
  }

  continueShopping(): void {
    this.router.navigate(['/']);
  }

  /** Starts a fresh payment attempt for the same order. */
  retryPayment(): void {
    if (!this.orderId || !this.canRetry) return;
    const id = this.orderId;
    this.retrying = true;
    this.api.payOrder(id).subscribe({
      next: async action => {
        try {
          await this.launcher.launch(id, action);
        } catch (err) {
          this.toasterService.showToast(apiErrorMessage(err, (err as Error)?.message || 'Payment could not be started'), ToastType.Error, 4000);
        } finally {
          this.retrying = false;
        }
      },
      error: err => {
        this.retrying = false;
        this.toasterService.showToast(apiErrorMessage(err, 'Payment could not be started'), ToastType.Error, 4000);
      }
    });
  }

  goToCheckout(): void {
    this.router.navigate(['/checkout']);
  }
}
