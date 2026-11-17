import { Component, OnInit, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../shared/header/header.component';
import { FooterComponent } from '../shared/footer/footer.component';
import { ApiService } from '@shared/core/api.service';
import { apiErrorMessage } from '@shared/core/api.interceptor';

@Component({
  selector: 'app-contact-us',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, FooterComponent],
  templateUrl: './contact-us.component.html',
  styleUrl: './contact-us.component.scss'
})
export class ContactUsComponent implements OnInit, AfterViewInit {

  contactForm = {
    name: '',
    phone: '',
    email: '',
    message: ''
  };

  private readonly api = inject(ApiService);
  submitting = false;

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initializeScrollEffects();
  }

  onSubmit(): void {
    const f = this.contactForm;
    if (!f.name.trim() || !f.message.trim()) {
      alert('Please enter your name and message.');
      return;
    }
    // Accept "97315 25004", "+91 9731525004" etc. — keep the last 10 digits
    const phone = f.phone.replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (this.submitting) return;
    this.submitting = true;
    this.api.enquiry({
      name: f.name.trim(),
      phone,
      email: f.email.trim() || undefined,
      subject: 'Website enquiry',
      message: f.message.trim()
    }).subscribe({
      next: () => {
        this.submitting = false;
        alert('Thank you for your message! We will get back to you soon.');
        this.resetForm();
      },
      error: err => {
        this.submitting = false;
        alert(apiErrorMessage(err, 'There was an error submitting your message. Please try again later.'));
      }
    });
  }

  private resetForm(): void {
    this.contactForm = {
      name: '',
      phone: '',
      email: '',
      message: ''
    };
  }

  private initializeScrollEffects(): void {
    // Back to top button functionality
    const backToTop = document.getElementById('backToTop');
    if (backToTop) {
      window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
          backToTop.classList.add('show');
        } else {
          backToTop.classList.remove('show');
        }
      });

      backToTop.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Header scroll effect
    const header = document.querySelector('.main-header');
    if (header) {
      window.addEventListener('scroll', () => {
        if (window.pageYOffset > 100) {
          (header as HTMLElement).style.padding = '10px 0';
          (header as HTMLElement).style.boxShadow = '0 2px 20px rgba(0,0,0,0.1)';
        } else {
          (header as HTMLElement).style.padding = '15px 0';
          (header as HTMLElement).style.boxShadow = '0 2px 15px rgba(0,0,0,0.05)';
        }
      });
    }
  }
}
