import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi, NewsletterSubscriber } from '../../core/admin-api';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

/**
 * Newsletter subscribers collected from the storefront footer sign-up. Staff can see who subscribed, unsubscribe
 * or re-subscribe an address, remove one, and export the active list as CSV for a mail tool.
 */
@Component({
  selector: 'app-admin-newsletter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-newsletter.component.html',
  styleUrl: './admin-newsletter.component.scss'
})
export class AdminNewsletterComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);

  subscribers: NewsletterSubscriber[] = [];
  loading = false;
  error = '';
  searchTerm = '';
  /** 'all' | 'subscribed' | 'unsubscribed' */
  statusFilter: 'all' | 'subscribed' | 'unsubscribed' = 'all';
  busyEmail = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.admin.newsletter().subscribe({
      next: r => {
        this.subscribers = r.subscribers ?? [];
        this.loading = false;
      },
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load subscribers');
        this.loading = false;
      }
    });
  }

  get filtered(): NewsletterSubscriber[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.subscribers.filter(s => {
      if (this.statusFilter === 'subscribed' && s.status !== 'SUBSCRIBED') return false;
      if (this.statusFilter === 'unsubscribed' && s.status === 'SUBSCRIBED') return false;
      return !term || s.email.toLowerCase().includes(term);
    });
  }

  get subscribedCount(): number {
    return this.subscribers.filter(s => s.status === 'SUBSCRIBED').length;
  }

  get unsubscribedCount(): number {
    return this.subscribers.length - this.subscribedCount;
  }

  isSubscribed(s: NewsletterSubscriber): boolean {
    return s.status === 'SUBSCRIBED';
  }

  toggle(s: NewsletterSubscriber): void {
    const next = this.isSubscribed(s) ? 'UNSUBSCRIBED' : 'SUBSCRIBED';
    this.busyEmail = s.email;
    this.api.admin.setNewsletterStatus(s.email, next).subscribe({
      next: saved => {
        Object.assign(s, saved);
        this.busyEmail = '';
        this.toaster.showToast(next === 'SUBSCRIBED' ? `${s.email} re-subscribed` : `${s.email} unsubscribed`, ToastType.Success, 2500);
      },
      error: err => {
        this.busyEmail = '';
        this.toaster.showToast(apiErrorMessage(err, 'Could not update the subscriber'), ToastType.Error, 4000);
      }
    });
  }

  remove(s: NewsletterSubscriber): void {
    if (!confirm(`Remove ${s.email} from the newsletter list? This cannot be undone.`)) return;
    this.busyEmail = s.email;
    this.api.admin.deleteNewsletter(s.email).subscribe({
      next: () => {
        this.subscribers = this.subscribers.filter(x => x.email !== s.email);
        this.busyEmail = '';
        this.toaster.showToast(`${s.email} removed`, ToastType.Success, 2500);
      },
      error: err => {
        this.busyEmail = '';
        this.toaster.showToast(apiErrorMessage(err, 'Could not remove the subscriber'), ToastType.Error, 4000);
      }
    });
  }

  /** Download the currently-filtered subscribers as a CSV (email, status, subscribed date, source). */
  exportCsv(): void {
    const rows = this.filtered;
    if (!rows.length) {
      this.toaster.showToast('Nothing to export', ToastType.Warn, 2500);
      return;
    }
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Email', 'Status', 'Subscribed On', 'Source'];
    const lines = rows.map(s => [esc(s.email), esc(s.status), esc((s.createdAt ?? '').slice(0, 10)), esc(s.source ?? '')].join(','));
    const csv = [header.join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
