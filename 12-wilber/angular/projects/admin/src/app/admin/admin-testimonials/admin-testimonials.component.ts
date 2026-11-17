import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/admin-api';
import { AdminCatalogApi, Testimonial } from '../../core/admin-catalog-api';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

/**
 * Customer testimonials ("Our Happy Customers"). Managed here and published to testimonials.json on every change,
 * so new reviews appear on the storefront landing without a code change or redeploy.
 */
@Component({
  selector: 'app-admin-testimonials',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-testimonials.component.html',
  styleUrl: './admin-testimonials.component.scss'
})
export class AdminTestimonialsComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly catalogApi = inject(AdminCatalogApi);
  private readonly toaster = inject(ToasterService);

  testimonials: Testimonial[] = [];
  loading = false;
  error = '';

  showEditor = false;
  saving = false;
  uploading = false;
  editorError = '';
  form: Testimonial = this.emptyForm();

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.catalogApi.testimonials().subscribe({
      next: r => {
        this.testimonials = r.testimonials ?? [];
        this.loading = false;
      },
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load testimonials');
        this.loading = false;
      }
    });
  }

  stars(rating?: number): number[] {
    return Array.from({ length: Math.max(1, Math.min(5, rating ?? 5)) });
  }

  // ---------- editor ----------

  add(): void {
    this.form = this.emptyForm();
    this.editorError = '';
    this.showEditor = true;
  }

  edit(t: Testimonial): void {
    this.form = structuredClone(t);
    this.editorError = '';
    this.showEditor = true;
  }

  close(): void {
    if (!this.saving && !this.uploading) this.showEditor = false;
  }

  async onImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading = true;
    this.editorError = '';
    try {
      this.form.imageUrl = await this.api.upload(file);
    } catch (err) {
      this.editorError = apiErrorMessage(err, 'Image upload failed');
    } finally {
      this.uploading = false;
      input.value = '';
    }
  }

  async save(): Promise<void> {
    this.editorError = this.validate();
    if (this.editorError) return;
    this.saving = true;
    const body: Testimonial = {
      ...this.form,
      name: this.form.name.trim(),
      location: this.form.location?.trim() || undefined,
      text: this.form.text.trim(),
      imageUrl: this.form.imageUrl?.trim() || undefined,
      rating: Number(this.form.rating) || 5,
      sortOrder: Number(this.form.sortOrder) || 0,
    };
    try {
      if (body.id) await firstValueFrom(this.catalogApi.updateTestimonial(body.id, body));
      else await firstValueFrom(this.catalogApi.createTestimonial(body));
      this.toaster.showToast(body.id ? 'Testimonial updated' : 'Testimonial added', ToastType.Success, 3000);
      this.saving = false;
      this.showEditor = false;
      this.load();
    } catch (err) {
      this.saving = false;
      this.editorError = apiErrorMessage(err, 'Could not save the testimonial');
    }
  }

  toggleActive(t: Testimonial): void {
    const body = { ...t, active: !t.active };
    this.catalogApi.updateTestimonial(t.id!, body).subscribe({
      next: saved => {
        Object.assign(t, saved);
        this.toaster.showToast(saved.active ? 'Testimonial shown' : 'Testimonial hidden', ToastType.Success, 2500);
      },
      error: err => this.toaster.showToast(apiErrorMessage(err, 'Could not update the testimonial'), ToastType.Error, 4000)
    });
  }

  remove(t: Testimonial): void {
    if (!confirm(`Delete the testimonial from "${t.name}"?`)) return;
    this.catalogApi.deleteTestimonial(t.id!).subscribe({
      next: () => {
        this.toaster.showToast('Testimonial deleted', ToastType.Success, 2500);
        this.load();
      },
      error: err => this.toaster.showToast(apiErrorMessage(err, 'Could not delete the testimonial'), ToastType.Error, 4000)
    });
  }

  private validate(): string {
    const f = this.form;
    if (!f.name?.trim()) return 'Name is required';
    if (!f.text?.trim()) return 'Testimonial text is required';
    return '';
  }

  private emptyForm(): Testimonial {
    return { name: '', location: '', rating: 5, imageUrl: '', text: '', sortOrder: 0, active: true };
  }
}
