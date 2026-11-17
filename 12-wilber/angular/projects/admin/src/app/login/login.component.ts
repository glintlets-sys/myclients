import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '@shared/core/api.service';
import { SessionService } from '@shared/core/session.service';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { environment } from '../../environments/environment';

const RESEND_SECONDS = 30;
const NOT_STAFF = 'This mobile number is not a staff account for this store. Customers sign in on the storefront.';

/** Staff sign-in: phone OTP (same endpoints as the storefront); customer accounts are signed straight out again. */
@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly title = inject(Title);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly storefrontUrl = environment.storefrontUrl;
  storeName = '';

  step: 'mobile' | 'otp' = 'mobile';
  mobile = '';
  otp = '';
  loading = false;
  errorMessage = '';
  successMessage = '';
  notStaff = false;
  resendIn = 0;
  private resendTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    if (this.session.isLoggedIn() && this.session.isStaff()) {
      this.goToReturnUrl();
      return;
    }
    if (this.route.snapshot.queryParamMap.get('reason') === 'not-staff') {
      this.notStaff = true;
      this.errorMessage = NOT_STAFF;
    }
    this.api.config().subscribe({
      next: c => {
        this.storeName = c.store?.name ?? '';
        if (this.storeName) this.title.setTitle(`Sign in · ${this.storeName} admin`);
      },
      error: () => {}
    });
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  isValidMobile(): boolean {
    return /^\d{10}$/.test(this.mobile);
  }

  sendOTP(): void {
    if (!this.isValidMobile()) {
      this.errorMessage = 'Please enter a valid 10-digit mobile number';
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.notStaff = false;
    this.api.requestOtp(this.mobile, true).subscribe({
      next: res => {
        this.loading = false;
        if (!environment.production && res.devOtp) console.info(`[dev] OTP for ${this.mobile}: ${res.devOtp}`);
        this.successMessage = 'OTP sent to your mobile.';
        this.step = 'otp';
        this.otp = '';
        this.startCountdown(RESEND_SECONDS);
      },
      error: err => {
        this.loading = false;
        this.errorMessage = apiErrorMessage(err, 'Failed to send OTP. Please try again.');
      }
    });
  }

  onOtpInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = value;
    this.otp = value;
  }

  verifyOTP(): void {
    if (this.otp.length !== 6) {
      this.errorMessage = 'Please enter the complete 6-digit OTP';
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.api.verifyOtp(this.mobile, this.otp, undefined, true).subscribe({
      next: s => {
        this.stopCountdown();
        if (s.user.role === 'CUSTOMER') {
          // verifyOtp already stored the session: end it on the server and locally.
          const done = () => {
            this.session.clear();
            this.loading = false;
            this.notStaff = true;
            this.errorMessage = NOT_STAFF;
            this.step = 'mobile';
            this.otp = '';
          };
          this.api.logout().subscribe({ next: done, error: done });
          return;
        }
        this.loading = false;
        this.goToReturnUrl();
      },
      error: err => {
        this.loading = false;
        if (err?.error?.error === 'not_staff') {
          this.notStaff = true;
          this.errorMessage = NOT_STAFF;
          this.step = 'mobile';
          this.otp = '';
          return;
        }
        this.errorMessage = apiErrorMessage(err, 'Invalid OTP. Please check and try again.');
      }
    });
  }

  resendOTP(): void {
    if (this.resendIn > 0) return;
    this.sendOTP();
  }

  changeNumber(): void {
    this.step = 'mobile';
    this.errorMessage = '';
    this.successMessage = '';
    this.otp = '';
    this.stopCountdown();
  }

  private goToReturnUrl(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // Only same-app paths, never an absolute or protocol-relative URL.
    const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') && !returnUrl.startsWith('/login')
      ? returnUrl : '/';
    this.router.navigateByUrl(safe);
  }

  private startCountdown(seconds: number): void {
    this.stopCountdown();
    this.resendIn = seconds;
    this.resendTimer = setInterval(() => {
      this.resendIn = Math.max(0, this.resendIn - 1);
      if (this.resendIn === 0) this.stopCountdown();
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = undefined;
    this.resendIn = 0;
  }
}
