import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { SettingsStore } from '../settings-store.service';

interface EmailTemplate { subject: string; html: string; }

const EMAIL_EVENTS: { id: string; label: string }[] = [
  { id: 'ORDER_PLACED', label: 'Order placed (customer)' },
  { id: 'ORDER_SHIPPED', label: 'Order shipped (customer)' },
  { id: 'ORDER_DELIVERED', label: 'Order delivered (customer)' },
  { id: 'ORDER_CANCELLED', label: 'Order cancelled (customer)' },
  { id: 'BACK_IN_STOCK', label: 'Back in stock (customer)' },
  { id: 'ADMIN_NEW_ORDER', label: 'New order alert (staff)' },
  { id: 'ADMIN_ENQUIRY', label: 'New enquiry alert (staff)' },
];

/** Email provider and per-event templates ({{placeholder}} syntax rendered by the server). */
@Component({
  selector: 'app-admin-email-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-email-settings.component.html',
  styleUrl: './admin-email-settings.component.scss'
})
export class AdminEmailSettingsComponent implements OnInit {
  private readonly store = inject(SettingsStore);
  private readonly toaster = inject(ToasterService);

  readonly providers = [
    { id: 'console', label: 'Console (development — emails are only logged)' },
    { id: 'ses', label: 'Amazon SES' },
  ];
  readonly events = EMAIL_EVENTS;
  readonly placeholders = '{{name}} {{orderId}} {{total}} {{paymentMethod}} {{itemsHtml}} {{trackingHtml}} {{reason}} {{productName}} {{storeName}} {{supportEmail}} {{phone}} {{email}} {{message}}';

  email: any = { provider: 'console' };
  templates: Record<string, EmailTemplate> = {};
  /** Server defaults (sent only while no templates are saved); kept for "restore default". */
  defaults: Record<string, EmailTemplate> = {};
  selectedEvent = EMAIL_EVENTS[0].id;
  showPreview = false;
  isLoading = false;

  ngOnInit(): void {
    this.loadEmailSettings();
  }

  loadEmailSettings(): void {
    const e = this.store.section<any>('email');
    if (e.defaultTemplates && Object.keys(e.defaultTemplates).length) this.defaults = e.defaultTemplates;
    const saved = e.templates && Object.keys(e.templates).length ? e.templates : this.defaults;
    this.templates = {};
    for (const ev of this.events) {
      const t = saved?.[ev.id];
      this.templates[ev.id] = { subject: t?.subject ?? '', html: t?.html ?? '' };
    }
    this.email = { provider: e.provider || 'console', from: e.from ?? '', replyTo: e.replyTo ?? '', notifyTo: e.notifyTo ?? '' };
  }

  get current(): EmailTemplate {
    return this.templates[this.selectedEvent];
  }

  get hasDefault(): boolean {
    return !!this.defaults[this.selectedEvent];
  }

  restoreDefault(): void {
    const d = this.defaults[this.selectedEvent];
    if (d) this.templates[this.selectedEvent] = { ...d };
  }

  async saveEmailSettings(): Promise<void> {
    if (this.email.provider === 'ses' && !this.email.from?.trim()) {
      this.toaster.showToast('Amazon SES needs a verified From address', ToastType.Error, 3000);
      return;
    }
    const templates: Record<string, EmailTemplate> = {};
    for (const [k, t] of Object.entries(this.templates)) {
      if (t.subject.trim() || t.html.trim()) templates[k] = { subject: t.subject.trim(), html: t.html };
    }
    this.isLoading = true;
    try {
      await this.store.save({
        email: {
          provider: this.email.provider,
          from: this.email.from?.trim() || null,
          replyTo: this.email.replyTo?.trim() || null,
          notifyTo: this.email.notifyTo?.trim() || null,
          templates,
        },
      });
      this.loadEmailSettings();
      this.toaster.showToast('Email settings saved', ToastType.Success, 3000);
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Error saving email settings'), ToastType.Error, 4000);
    } finally {
      this.isLoading = false;
    }
  }
}
