import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '@shared/core/api.service';
import { PaymentAction } from '@shared/core/models';

declare global {
  interface Window { Razorpay?: any; }
}

/**
 * Carries out the PaymentAction returned by POST /v1/orders (or /pay). Every path ends on
 * /payment-response?orderId=…, which asks the server for the verified result.
 */
@Injectable({ providedIn: 'root' })
export class PaymentLauncherService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  async launch(orderId: string, action: PaymentAction): Promise<void> {
    switch (action.type) {
      case 'redirect':
        window.location.href = action.url!;
        return;
      case 'form_post':
        this.submitForm(action.url!, action.fields ?? {});
        return;
      case 'razorpay_checkout':
        await this.openRazorpay(orderId, action.data);
        return;
      case 'none':
        await this.router.navigate(['/payment-response'], { queryParams: { orderId } });
        return;
      default:
        throw new Error(action.message || 'Payment could not be started');
    }
  }

  private submitForm(url: string, fields: Record<string, string>): void {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  private async openRazorpay(orderId: string, data: any): Promise<void> {
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    const goToResult = () => this.router.navigate(['/payment-response'], { queryParams: { orderId } });
    const rzp = new window.Razorpay({
      key: data.keyId,
      order_id: data.razorpayOrderId,
      amount: data.amount,
      currency: data.currency,
      name: data.name,
      description: data.description,
      prefill: data.prefill,
      handler: (res: Record<string, string>) => {
        this.api.verifyPayment(orderId, {
          razorpay_order_id: res['razorpay_order_id'],
          razorpay_payment_id: res['razorpay_payment_id'],
          razorpay_signature: res['razorpay_signature'],
        }).subscribe({ next: () => goToResult(), error: () => goToResult() });
      },
      modal: { ondismiss: () => goToResult() },
    });
    rzp.open();
  }
}

function loadScript(src: string): Promise<void> {
  if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
