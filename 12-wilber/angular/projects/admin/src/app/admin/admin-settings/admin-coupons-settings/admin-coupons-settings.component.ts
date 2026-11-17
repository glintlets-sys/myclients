import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { AdminApi } from '../../../core/admin-api';
import { Coupon } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { toPaise, toRupees } from '../settings-store.service';

interface CouponForm {
  code: string;
  description: string;
  type: 'PERCENT' | 'FLAT';
  /** Percent for PERCENT, rupees for FLAT. */
  value: number | null;
  minOrderRupees: number | null;
  maxDiscountRupees: number | null;
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  perUserLimit: number | null;
  active: boolean;
}

/** Discount coupons (permission: discounts). Money is stored in paise; FLAT values are paise, PERCENT values are percent. */
@Component({
  selector: 'app-admin-coupons-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './admin-coupons-settings.component.html',
  styleUrl: './admin-coupons-settings.component.scss'
})
export class AdminCouponsSettingsComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);

  coupons: Coupon[] = [];
  loading = false;
  saving = false;
  error = '';
  /** null = list view; otherwise the form being edited. */
  form: CouponForm | null = null;
  editingCode: string | null = null;

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const res = await firstValueFrom(this.api.admin.coupons());
      this.coupons = (res.coupons ?? []).sort((a, b) => a.code.localeCompare(b.code));
    } catch (err) {
      this.error = apiErrorMessage(err, 'Could not load coupons');
    } finally {
      this.loading = false;
    }
  }

  newCoupon(): void {
    this.editingCode = null;
    this.form = {
      code: '', description: '', type: 'PERCENT', value: 10, minOrderRupees: 0, maxDiscountRupees: 0,
      startsAt: '', endsAt: '', usageLimit: 0, perUserLimit: 0, active: true,
    };
  }

  edit(c: Coupon): void {
    this.editingCode = c.code;
    this.form = {
      code: c.code,
      description: c.description ?? '',
      type: c.type,
      value: c.type === 'FLAT' ? toRupees(c.value) : c.value,
      minOrderRupees: toRupees(c.minOrderPaise),
      maxDiscountRupees: toRupees(c.maxDiscountPaise),
      startsAt: (c.startsAt ?? '').slice(0, 10),
      endsAt: (c.endsAt ?? '').slice(0, 10),
      usageLimit: c.usageLimit ?? 0,
      perUserLimit: c.perUserLimit ?? 0,
      active: c.active,
    };
  }

  cancel(): void {
    this.form = null;
    this.editingCode = null;
  }

  describe(c: Coupon): string {
    return c.type === 'PERCENT' ? `${c.value}% off` : `₹${toRupees(c.value).toLocaleString('en-IN')} off`;
  }

  async save(): Promise<void> {
    const f = this.form;
    if (!f) return;
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return this.fail('Code must be 3-30 letters, digits, - or _');
    const value = Number(f.value);
    if (!(value > 0) || (f.type === 'PERCENT' && value > 100)) return this.fail('Enter a valid discount value');
    if (f.startsAt && f.endsAt && f.endsAt < f.startsAt) return this.fail('End date is before start date');

    const coupon: Coupon = {
      code,
      description: f.description.trim() || undefined,
      type: f.type,
      value: f.type === 'FLAT' ? toPaise(value) : Math.round(value),
      minOrderPaise: toPaise(f.minOrderRupees),
      maxDiscountPaise: f.type === 'PERCENT' ? toPaise(f.maxDiscountRupees) : 0,
      startsAt: f.startsAt || undefined,
      endsAt: f.endsAt || undefined,
      usageLimit: Math.max(0, Math.round(Number(f.usageLimit) || 0)),
      perUserLimit: Math.max(0, Math.round(Number(f.perUserLimit) || 0)),
      active: f.active,
    };
    if (!this.editingCode && this.coupons.some(c => c.code === code)) return this.fail(`Coupon ${code} already exists`);

    this.saving = true;
    try {
      await firstValueFrom(this.api.admin.saveCoupon(coupon));
      this.toaster.showToast(`Coupon ${code} saved`, ToastType.Success, 3000);
      this.cancel();
      await this.load();
    } catch (err) {
      this.fail(apiErrorMessage(err, 'Could not save coupon'));
    } finally {
      this.saving = false;
    }
  }

  async toggleActive(c: Coupon): Promise<void> {
    try {
      await firstValueFrom(this.api.admin.saveCoupon({ ...c, active: !c.active }));
      c.active = !c.active;
    } catch (err) {
      this.fail(apiErrorMessage(err, 'Could not update coupon'));
    }
  }

  async remove(c: Coupon): Promise<void> {
    if (!confirm(`Delete coupon ${c.code}? Customers will no longer be able to use it.`)) return;
    try {
      await firstValueFrom(this.api.admin.deleteCoupon(c.code));
      this.coupons = this.coupons.filter(x => x.code !== c.code);
      this.toaster.showToast(`Coupon ${c.code} deleted`, ToastType.Success, 3000);
    } catch (err) {
      this.fail(apiErrorMessage(err, 'Could not delete coupon'));
    }
  }

  private fail(message: string): void {
    this.toaster.showToast(message, ToastType.Error, 4000);
  }
}
