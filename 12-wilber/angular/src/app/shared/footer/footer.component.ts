import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '@shared/core/api.service';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
  private readonly api = inject(ApiService);
  private readonly toaster = inject(ToasterService);

  newsletterEmail = '';
  subscribing = false;

  private static readonly EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  subscribeNewsletter(): void {
    const email = this.newsletterEmail.trim();
    if (!FooterComponent.EMAIL.test(email)) {
      this.toaster.showToast('Please enter a valid email address.', ToastType.Warn, 3000);
      return;
    }
    if (this.subscribing) return;
    this.subscribing = true;
    this.api.subscribeNewsletter(email).subscribe({
      next: () => {
        this.subscribing = false;
        this.newsletterEmail = '';
        this.toaster.showToast('Thanks for subscribing! You will hear from us soon.', ToastType.Success, 3500);
      },
      error: err => {
        this.subscribing = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not subscribe right now. Please try again later.'), ToastType.Error, 4000);
      }
    });
  }
}
