import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/admin-api';
import { AdminCatalogApi, Banner } from '../../core/admin-catalog-api';
import { Category, Product } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

type BannerStatus = 'live' | 'scheduled' | 'ended' | 'inactive';

/** Editor model: schedule as datetime-local strings in the browser's time zone. */
interface BannerForm extends Banner {
  startLocal: string;
  endLocal: string;
}

const PLACEMENT_LABEL: Record<string, string> = {
  'home-hero': 'Home – hero slider',
  'home-strip': 'Home – offer strip',
  'category-top': 'Category page – top',
};

/**
 * Marketing banners (admin only for now; the storefront reads the published banners.json later). Live banners
 * are published to the CDN on every change; scheduled ones switch on/off with the 15-minute scheduled run.
 */
@Component({
  selector: 'app-admin-banners',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-banners.component.html',
  styleUrl: './admin-banners.component.scss'
})
export class AdminBannersComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly catalogApi = inject(AdminCatalogApi);
  private readonly toaster = inject(ToasterService);

  banners: Banner[] = [];
  placements: string[] = ['category-top', 'home-hero', 'home-strip'];
  categories: Category[] = [];
  products: Product[] = [];
  placementFilter = '';
  loading = false;
  error = '';
  private serverNow = Date.now();

  showEditor = false;
  saving = false;
  uploading = '';
  editorError = '';
  form: BannerForm = this.emptyForm();

  ngOnInit(): void {
    this.load();
    this.api.admin.categories().subscribe({ next: r => this.categories = r.categories, error: () => {} });
    this.api.admin.products({ size: 200 }).subscribe({
      next: r => this.products = [...r.items].sort((a, b) => a.name.localeCompare(b.name)),
      error: () => {}
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.catalogApi.banners().subscribe({
      next: r => {
        this.banners = r.banners;
        if (r.placements?.length) this.placements = r.placements;
        this.serverNow = Date.parse(r.now) || Date.now();
        this.loading = false;
      },
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load banners');
        this.loading = false;
      }
    });
  }

  get visibleBanners(): Banner[] {
    return this.placementFilter ? this.banners.filter(b => b.placement === this.placementFilter) : this.banners;
  }

  placementLabel(p: string): string {
    return PLACEMENT_LABEL[p] ?? p;
  }

  status(b: Banner): BannerStatus {
    if (!b.active) return 'inactive';
    const now = this.serverNow;
    if (b.startAt && now < boundary(b.startAt, false)) return 'scheduled';
    if (b.endAt && now > boundary(b.endAt, true)) return 'ended';
    return 'live';
  }

  statusClass(b: Banner): string {
    return { live: 'bg-success', scheduled: 'bg-info text-dark', ended: 'bg-secondary', inactive: 'bg-light text-dark' }[this.status(b)];
  }

  linkLabel(b: Banner): string {
    switch (b.linkType) {
      case 'product': return 'Product: ' + (this.products.find(p => p.id === b.linkTarget)?.name ?? b.linkTarget);
      case 'category': return 'Category: ' + (this.categories.find(c => c.id === b.linkTarget)?.name ?? b.linkTarget);
      case 'url': return b.linkTarget ?? '';
      default: return 'No link';
    }
  }

  formatWhen(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  // ---------- editor ----------

  add(): void {
    this.form = this.emptyForm();
    this.editorError = '';
    this.showEditor = true;
  }

  edit(b: Banner): void {
    this.form = { ...structuredClone(b), startLocal: toLocalInput(b.startAt, false), endLocal: toLocalInput(b.endAt, true) };
    this.editorError = '';
    this.showEditor = true;
  }

  close(): void {
    if (!this.saving && !this.uploading) this.showEditor = false;
  }

  async onImage(event: Event, which: 'imageDesktop' | 'imageMobile'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading = which;
    this.editorError = '';
    try {
      this.form[which] = await this.api.upload(file);
    } catch (err) {
      this.editorError = apiErrorMessage(err, 'Image upload failed');
    } finally {
      this.uploading = '';
      input.value = '';
    }
  }

  async save(): Promise<void> {
    this.editorError = this.validate();
    if (this.editorError) return;
    this.saving = true;
    const { startLocal, endLocal, ...rest } = this.form;
    const body: Banner = {
      ...rest,
      title: rest.title.trim(),
      linkTarget: rest.linkType === 'none' ? null : (rest.linkTarget || null),
      categoryId: rest.placement === 'category-top' ? (rest.categoryId || null) : null,
      imageMobile: rest.imageMobile || null,
      sortOrder: Number(rest.sortOrder) || 0,
      startAt: startLocal ? new Date(startLocal).toISOString() : null,
      endAt: endLocal ? new Date(endLocal).toISOString() : null,
    };
    try {
      if (body.id) await firstValueFrom(this.catalogApi.updateBanner(body.id, body));
      else await firstValueFrom(this.catalogApi.createBanner(body));
      this.toaster.showToast(body.id ? 'Banner updated' : 'Banner created', ToastType.Success, 3000);
      this.saving = false;
      this.showEditor = false;
      this.load();
    } catch (err) {
      this.saving = false;
      this.editorError = apiErrorMessage(err, 'Could not save the banner');
    }
  }

  toggleActive(b: Banner): void {
    const body = { ...b, active: !b.active };
    this.catalogApi.updateBanner(b.id!, body).subscribe({
      next: saved => {
        Object.assign(b, saved);
        this.toaster.showToast(saved.active ? 'Banner switched on' : 'Banner switched off', ToastType.Success, 2500);
      },
      error: err => this.toaster.showToast(apiErrorMessage(err, 'Could not update the banner'), ToastType.Error, 4000)
    });
  }

  remove(b: Banner): void {
    if (!confirm(`Delete the banner "${b.title}"?`)) return;
    this.catalogApi.deleteBanner(b.id!).subscribe({
      next: () => {
        this.toaster.showToast('Banner deleted', ToastType.Success, 2500);
        this.load();
      },
      error: err => this.toaster.showToast(apiErrorMessage(err, 'Could not delete the banner'), ToastType.Error, 4000)
    });
  }

  private validate(): string {
    const f = this.form;
    if (!f.title?.trim()) return 'Title is required';
    if (!f.placement) return 'Choose where the banner appears';
    if (!f.imageDesktop) return 'Upload a desktop image';
    if (f.linkType === 'url' && !/^(https?:\/\/|\/(?!\/))/i.test(f.linkTarget ?? '')) return 'Link URL must start with https:// or /';
    if ((f.linkType === 'product' || f.linkType === 'category') && !f.linkTarget) return 'Choose what the banner links to';
    if (f.startLocal && f.endLocal && new Date(f.endLocal) <= new Date(f.startLocal)) return 'End must be after start';
    return '';
  }

  private emptyForm(): BannerForm {
    return {
      title: '', subtitle: '', placement: 'home-hero', categoryId: null, imageDesktop: '', imageMobile: '', altText: '',
      linkType: 'none', linkTarget: null, ctaLabel: '', sortOrder: 0, active: true, startAt: null, endAt: null,
      startLocal: '', endLocal: ''
    };
  }
}

/** Date-only values mean the whole day (UTC), like coupons. */
function boundary(value: string, end: boolean): number {
  return value.length === 10 ? Date.parse(value + (end ? 'T23:59:59Z' : 'T00:00:00Z')) : Date.parse(value);
}

/** ISO instant → value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(value: string | null | undefined, end: boolean): string {
  if (!value) return '';
  const d = new Date(boundary(value, end));
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
