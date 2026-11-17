import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { SecretKey, SettingsStore } from '../settings-store.service';

export const SMS_EVENTS: { id: string; label: string; hint: string }[] = [
  { id: 'OTP', label: 'Login OTP', hint: 'Variables: otp (also OTP, var1)' },
  { id: 'ORDER_PLACED', label: 'Order placed', hint: 'Variables: name, orderId, amount' },
  { id: 'ORDER_SHIPPED', label: 'Order shipped', hint: 'Variables: name, orderId, awb' },
  { id: 'ORDER_DELIVERED', label: 'Order delivered', hint: 'Variables: name, orderId, awb' },
  { id: 'ORDER_CANCELLED', label: 'Order cancelled', hint: 'Variables: name, orderId, awb' },
  { id: 'BACK_IN_STOCK', label: 'Back in stock', hint: 'Variables: product' },
];

/** SMS provider (MSG91 flows, or console logging in development). The MSG91 auth key is a write-only secret. */
@Component({
  selector: 'app-admin-sms-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-sms-settings.component.html',
  styleUrl: './admin-sms-settings.component.scss'
})
export class AdminSmsSettingsComponent implements OnInit {
  private readonly store = inject(SettingsStore);
  private readonly toaster = inject(ToasterService);

  readonly smsProviders = [
    { id: 'console', label: 'Console (development — messages are only logged)' },
    { id: 'msg91', label: 'MSG91' },
  ];
  readonly events = SMS_EVENTS;
  isLoading = false;

  sms: { provider: string; senderId?: string; templates: Record<string, string> } = { provider: 'console', templates: {} };
  authKey = '';

  ngOnInit(): void {
    this.loadSmsSettings();
  }

  loadSmsSettings(): void {
    const s = this.store.section<any>('sms');
    this.sms = { provider: s.provider || 'console', senderId: s.senderId, templates: { ...(s.templates ?? {}) } };
    this.authKey = '';
  }

  get authKeySet(): boolean {
    return this.store.isSecretSet('msg91.authKey' as SecretKey);
  }

  async saveSmsSettings(): Promise<void> {
    if (this.sms.provider === 'msg91') {
      if (!this.authKeySet && !this.authKey.trim()) return this.fail('Enter the MSG91 auth key');
      if (!this.sms.templates['OTP']) return this.fail('MSG91 needs at least the OTP template id');
    }
    const templates: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.sms.templates)) if (v && v.trim()) templates[k] = v.trim();

    this.isLoading = true;
    try {
      const sent = await this.store.saveSecrets({ 'msg91.authKey': this.authKey });
      await this.store.save({ sms: { provider: this.sms.provider, senderId: this.sms.senderId?.trim() || null, templates } });
      this.loadSmsSettings();
      this.toaster.showToast(sent ? 'SMS settings and auth key saved' : 'SMS settings saved', ToastType.Success, 3000);
    } catch (err) {
      this.fail(apiErrorMessage(err, 'Error saving SMS settings'));
    } finally {
      this.isLoading = false;
    }
  }

  private fail(message: string): void {
    this.toaster.showToast(message, ToastType.Error, 4000);
  }
}
