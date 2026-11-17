import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { environment } from '../../../../environments/environment';
import { SecretKey, SettingsStore, parseList, toPaise, toRupees } from '../settings-store.service';

type Provider = 'phonepe' | 'razorpay' | 'ccavenue' | 'cod';

/**
 * Payment gateways. Public settings (enabled, mode, merchant/key ids) are saved with the tenant config;
 * salts, keys and working keys go to the write-only secrets endpoint and are never shown again.
 */
@Component({
  selector: 'app-admin-payment-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-payment-settings.component.html',
  styleUrl: './admin-payment-settings.component.scss'
})
export class AdminPaymentSettingsComponent implements OnInit {
  private readonly store = inject(SettingsStore);
  private readonly toaster = inject(ToasterService);

  readonly providers: { id: Provider; label: string }[] = [
    { id: 'phonepe', label: 'PhonePe' },
    { id: 'razorpay', label: 'Razorpay' },
    { id: 'ccavenue', label: 'CCAvenue' },
    { id: 'cod', label: 'Cash on Delivery' },
  ];
  selectedPaymentProvider: Provider = 'phonepe';
  isLoading = false;

  payments: any = { phonepe: {}, razorpay: {}, ccavenue: {}, cod: {} };
  cod = { maxOrderRupees: 0, feeRupees: 0, allowedPincodes: '', blockedPincodes: '' };
  secrets: Partial<Record<SecretKey, string>> = {};

  /** Gateway callback URLs to paste into the gateway dashboards. */
  readonly webhookBase = `${environment.apiUrl}/v1/webhooks`;
  readonly tenant = environment.tenant;

  ngOnInit(): void {
    this.loadPaymentSettings();
  }

  loadPaymentSettings(): void {
    const p = this.store.section<any>('payments');
    this.payments = {
      phonepe: { enabled: false, mode: 'sandbox', saltIndex: 1, ...p.phonepe },
      razorpay: { enabled: false, mode: 'sandbox', ...p.razorpay },
      ccavenue: { enabled: false, mode: 'sandbox', ...p.ccavenue },
      cod: { enabled: false, ...p.cod },
    };
    this.cod = {
      maxOrderRupees: toRupees(p.cod?.maxOrderPaise),
      feeRupees: toRupees(p.cod?.feePaise),
      allowedPincodes: (p.cod?.allowedPincodes ?? []).join(', '),
      blockedPincodes: (p.cod?.blockedPincodes ?? []).join(', '),
    };
    this.secrets = {};
  }

  isSet(name: SecretKey): boolean {
    return this.store.isSecretSet(name);
  }

  isEnabled(id: Provider): boolean {
    return !!this.payments[id]?.enabled;
  }

  async savePaymentSettings(): Promise<void> {
    const { phonepe, razorpay, ccavenue } = this.payments;
    if (phonepe.enabled && !phonepe.merchantId) return this.fail('PhonePe needs a Merchant ID');
    if (razorpay.enabled && !razorpay.keyId) return this.fail('Razorpay needs a Key ID');
    if (ccavenue.enabled && !ccavenue.merchantId) return this.fail('CCAvenue needs a Merchant ID');

    this.isLoading = true;
    try {
      const sent = await this.store.saveSecrets(this.secrets);
      await this.store.save({
        payments: {
          phonepe: { ...phonepe, saltIndex: Number(phonepe.saltIndex) || 1 },
          razorpay,
          ccavenue,
          cod: {
            enabled: !!this.payments.cod.enabled,
            maxOrderPaise: toPaise(this.cod.maxOrderRupees),
            feePaise: toPaise(this.cod.feeRupees),
            allowedPincodes: parseList(this.cod.allowedPincodes),
            blockedPincodes: parseList(this.cod.blockedPincodes),
          },
        },
      });
      this.loadPaymentSettings();
      this.toaster.showToast(sent ? `Payment settings and ${sent} secret(s) saved` : 'Payment settings saved', ToastType.Success, 3000);
    } catch (err) {
      this.fail(apiErrorMessage(err, 'Error saving payment settings'));
    } finally {
      this.isLoading = false;
    }
  }

  private fail(message: string): void {
    this.toaster.showToast(message, ToastType.Error, 4000);
  }
}
