import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HeaderComponent } from '../shared/header/header.component';
import { ApiService } from '@shared/core/api.service';
import { SessionService } from '@shared/core/session.service';
import { CartStoreService } from '../core/cart-store.service';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { environment } from '../../environments/environment';

const RESEND_SECONDS = 30;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly cart = inject(CartStoreService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** mobile → otp → (first login without a name) register/profile details. */
  step: 'mobile' | 'otp' | 'register' = 'mobile';
  mobile = '';
  otp = '';
  firstName = '';
  lastName = '';
  email = '';

  loading = false;
  errorMessage = '';
  successMessage = '';
  resendIn = 0;
  private resendTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    if (this.session.isLoggedIn()) {
      this.goToReturnUrl();
    }
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
    this.api.requestOtp(this.mobile).subscribe({
      next: res => {
        this.loading = false;
        if (!environment.production && res.devOtp) {
          console.info(`[dev] OTP for ${this.mobile}: ${res.devOtp}`);
        }
        this.successMessage = 'OTP sent successfully!';
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
    // verifyOtp stores the session; the guest cart is merged into the account cart.
    this.api.verifyOtp(this.mobile, this.otp, this.cart.guestLines()).subscribe({
      next: s => {
        this.loading = false;
        this.stopCountdown();
        if (!s.user.name) {
          this.step = 'register';
          this.successMessage = 'Please provide your details to complete registration';
          return;
        }
        this.successMessage = 'Login successful!';
        this.goToReturnUrl();
      },
      error: err => {
        this.loading = false;
        this.errorMessage = apiErrorMessage(err, 'Invalid OTP. Please check and try again.');
      }
    });
  }

  /** Saves the name/email of a first-time customer (they are already logged in at this point). */
  register(): void {
    if (!this.firstName.trim() || !this.lastName.trim()) {
      this.errorMessage = 'Please enter your first name and last name';
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    const name = `${this.firstName.trim()} ${this.lastName.trim()}`;
    const email = this.email.trim() || undefined;
    this.api.updateMe({ name, email }).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Registration complete!';
        this.goToReturnUrl();
      },
      error: err => {
        this.loading = false;
        this.errorMessage = apiErrorMessage(err, 'Could not save your details. Please try again.');
      }
    });
  }

  resendOTP(): void {
    if (this.resendIn > 0) return;
    this.sendOTP();
  }

  goBackToMobile(): void {
    this.step = 'mobile';
    this.errorMessage = '';
    this.successMessage = '';
    this.otp = '';
    this.stopCountdown();
  }

  /** "Back" on the details step: the OTP is already verified, so skip the details and continue. */
  goBackToOtp(): void {
    this.errorMessage = '';
    this.successMessage = '';
    if (this.session.isLoggedIn()) {
      this.goToReturnUrl();
    } else {
      this.step = 'otp';
    }
  }

  private goToReturnUrl(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // Only same-app paths, never an absolute or protocol-relative URL.
    const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
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
