import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { SettingsStore } from '../settings-store.service';

/** Web-analytics tag IDs (Google Analytics 4 + Meta/Facebook Pixel). The storefront injects them from config. */
@Component({
  selector: 'app-admin-analytics-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-analytics-settings.component.html',
})
export class AdminAnalyticsSettingsComponent implements OnInit {
  private readonly store = inject(SettingsStore);
  private readonly toaster = inject(ToasterService);

  analytics: { googleMeasurementId?: string; facebookPixelId?: string } = {};
  isLoading = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.analytics = { googleMeasurementId: '', facebookPixelId: '', ...this.store.section<any>('analytics') };
  }

  async save(): Promise<void> {
    const ga = (this.analytics.googleMeasurementId || '').trim();
    const fb = (this.analytics.facebookPixelId || '').trim();
    if (ga && !/^G-[A-Z0-9]{6,}$/i.test(ga)) {
      this.toaster.showToast('Google Measurement ID should look like G-XXXXXXXXXX', ToastType.Error, 3500);
      return;
    }
    this.isLoading = true;
    try {
      await this.store.save({ analytics: { googleMeasurementId: ga, facebookPixelId: fb } });
      this.load();
      this.toaster.showToast('Analytics settings saved — republished to the storefront', ToastType.Success, 3000);
    } catch (e) {
      this.toaster.showToast(apiErrorMessage(e, 'Could not save analytics settings'), ToastType.Error, 4000);
    } finally {
      this.isLoading = false;
    }
  }
}
