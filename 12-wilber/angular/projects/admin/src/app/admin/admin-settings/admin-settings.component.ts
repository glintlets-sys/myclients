import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminPlatformSettingsComponent } from './admin-platform-settings/admin-platform-settings.component';
import { AdminPaymentSettingsComponent } from './admin-payment-settings/admin-payment-settings.component';
import { AdminShippingSettingsComponent } from './admin-shipping-settings/admin-shipping-settings.component';
import { AdminSmsSettingsComponent } from './admin-sms-settings/admin-sms-settings.component';
import { AdminEmailSettingsComponent } from './admin-email-settings/admin-email-settings.component';
import { AdminCouponsSettingsComponent } from './admin-coupons-settings/admin-coupons-settings.component';
import { SettingsStore } from './settings-store.service';
import { SessionService } from '@shared/core/session.service';
import { apiErrorMessage } from '@shared/core/api.interceptor';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AdminPlatformSettingsComponent,
    AdminPaymentSettingsComponent,
    AdminShippingSettingsComponent,
    AdminSmsSettingsComponent,
    AdminEmailSettingsComponent,
    AdminCouponsSettingsComponent
  ],
  providers: [SettingsStore],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss'
})
export class AdminSettingsComponent implements OnInit {
  readonly store = inject(SettingsStore);
  private readonly session = inject(SessionService);

  activeSettingsView = 'platform';
  loadError = '';
  /** Tab to open first (platform | payment | shipping | sms | email | coupons) — set by the admin menu search. */
  @Input() set tab(value: string | null | undefined) {
    if (value) this.activeSettingsView = value === 'coupons' && !this.canManageCoupons ? 'platform' : value;
  }

  /** Coupons need the "discounts" permission, everything else here needs "settings". */
  get canManageCoupons(): boolean {
    return this.session.can('discounts');
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loadError = '';
    this.store.load().catch(err => this.loadError = apiErrorMessage(err, 'Could not load settings.'));
  }

  setActiveView(view: string): void {
    this.activeSettingsView = view;
  }
}
