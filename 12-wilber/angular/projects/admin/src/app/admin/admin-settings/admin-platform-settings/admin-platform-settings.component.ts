import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { AdminApi } from '../../../core/admin-api';
import { SessionService } from '@shared/core/session.service';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { SettingsStore } from '../settings-store.service';

const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

/** Store identity, GST/tax behaviour, storefront features and catalog publishing. */
@Component({
  selector: 'app-admin-platform-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-platform-settings.component.html',
  styleUrl: './admin-platform-settings.component.scss'
})
export class AdminPlatformSettingsComponent implements OnInit {
  private readonly settingsStore = inject(SettingsStore);
  private readonly api = inject(AdminApi);
  private readonly session = inject(SessionService);
  private readonly toaster = inject(ToasterService);

  readonly states = INDIAN_STATES;
  store: any = {};
  tax: any = { pricesIncludeTax: true, defaultRatePercent: 18 };
  features: any = {};
  isLoading = false;
  uploadingLogo = false;

  lastPublish: any = null;
  publishing = false;

  get canPublish(): boolean {
    return this.session.can('products');
  }

  ngOnInit(): void {
    this.reset();
    this.lastPublish = this.settingsStore.settings()?.lastPublish ?? null;
  }

  reset(): void {
    this.store = this.settingsStore.section('store');
    this.tax = this.settingsStore.section('tax');
    this.features = this.settingsStore.section('features');
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingLogo = true;
    try {
      this.store.logoUrl = await this.api.upload(file);
      this.toaster.showToast('Logo uploaded — remember to save.', ToastType.Info, 3000);
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Logo upload failed'), ToastType.Error, 4000);
    } finally {
      this.uploadingLogo = false;
      input.value = '';
    }
  }

  async savePlatform(): Promise<void> {
    const rate = Number(this.tax.defaultRatePercent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      this.toaster.showToast('Default GST rate must be between 0 and 100', ToastType.Error, 3000);
      return;
    }
    this.isLoading = true;
    try {
      await this.settingsStore.save({
        store: { ...this.store, gstin: (this.store.gstin || '').trim().toUpperCase() || null },
        tax: { pricesIncludeTax: !!this.tax.pricesIncludeTax, defaultRatePercent: rate },
        features: this.features,
      });
      this.reset();
      this.toaster.showToast('Store settings saved', ToastType.Success, 3000);
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Error saving store settings'), ToastType.Error, 4000);
    } finally {
      this.isLoading = false;
    }
  }

  async publishNow(): Promise<void> {
    this.publishing = true;
    try {
      this.lastPublish = await firstValueFrom(this.api.admin.publishNow());
      this.toaster.showToast('Catalog published', ToastType.Success, 3000);
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Publish failed'), ToastType.Error, 4000);
    } finally {
      this.publishing = false;
    }
  }
}
