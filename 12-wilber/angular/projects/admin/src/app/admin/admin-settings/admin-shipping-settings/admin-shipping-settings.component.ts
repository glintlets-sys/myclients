import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { SecretKey, SettingsStore, toPaise, toRupees } from '../settings-store.service';

/** Shipping charges and the Shiprocket integration (credentials are write-only secrets used by the server). */
@Component({
  selector: 'app-admin-shipping-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-shipping-settings.component.html',
  styleUrl: './admin-shipping-settings.component.scss'
})
export class AdminShippingSettingsComponent implements OnInit {
  private readonly store = inject(SettingsStore);
  private readonly toaster = inject(ToasterService);

  /** Shiprocket exists but is not configured for this store — hidden for now (Krishna, 13 Nov 2026). Saving keeps the stored provider. */
  readonly showShiprocket = false;
  readonly shippingProviders = [
    { id: 'none', label: 'Manual (no integration)' },
    { id: 'shiprocket', label: 'Shiprocket' },
  ];
  isLoading = false;

  shipping: any = {};
  flatFeeRupees = 0;
  freeAboveRupees = 0;
  secrets: Partial<Record<SecretKey, string>> = {};

  ngOnInit(): void {
    this.loadShippingSettings();
  }

  loadShippingSettings(): void {
    this.shipping = { provider: 'none', pickupLocation: 'Primary', ...this.store.section<any>('shipping') };
    this.flatFeeRupees = toRupees(this.shipping.flatFeePaise);
    this.freeAboveRupees = toRupees(this.shipping.freeAbovePaise);
    this.secrets = {};
  }

  isSet(name: SecretKey): boolean {
    return this.store.isSecretSet(name);
  }

  async saveShippingSettings(): Promise<void> {
    const s = this.shipping;
    if (s.provider === 'shiprocket' && !s.pickupLocation) {
      this.toaster.showToast('Shiprocket needs a pickup location name', ToastType.Error, 3000);
      return;
    }
    this.isLoading = true;
    try {
      const sent = await this.store.saveSecrets(this.secrets);
      await this.store.save({
        shipping: {
          flatFeePaise: toPaise(this.flatFeeRupees),
          freeAbovePaise: toPaise(this.freeAboveRupees),
          provider: s.provider,
          pickupLocation: s.pickupLocation,
          defaultWeightKg: Number(s.defaultWeightKg) || 0,
          defaultLengthCm: Number(s.defaultLengthCm) || 0,
          defaultBreadthCm: Number(s.defaultBreadthCm) || 0,
          defaultHeightCm: Number(s.defaultHeightCm) || 0,
        },
      });
      this.loadShippingSettings();
      this.toaster.showToast(sent ? 'Shipping settings and credentials saved' : 'Shipping settings saved', ToastType.Success, 3000);
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Error saving shipping settings'), ToastType.Error, 4000);
    } finally {
      this.isLoading = false;
    }
  }
}
