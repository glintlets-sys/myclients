import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../core/admin-api';
import { AdminCatalogApi, Banner } from '../core/admin-catalog-api';
import { Blog, Category, Product } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { loadAllProducts } from '../admin/admin-recommendations/recommendations';

const PLACEMENTS: Record<string, string> = { 'home-hero': 'Home – hero slider', 'home-strip': 'Home – offer strip', 'category-top': 'Category page – top' };

/** Banners: live / off list with big previews, on/off switch, add or edit in a bottom sheet (photo from camera or gallery). */
@Component({
  selector: 'app-m-banners',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="m-page">
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div *ngIf="loading" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>
    <div class="m-list">
      <div *ngFor="let b of banners" class="m-card m-banner" [class.dim]="!b.active">
        <img [src]="b.imageMobile || b.imageDesktop" [alt]="b.altText || b.title" (click)="edit(b)">
        <div class="m-card-top mt-2"><div><b>{{ b.title }}</b><small class="d-block m-muted">{{ placement(b.placement) }} · #{{ b.sortOrder }}</small></div>
          <label class="m-switch sm"><input type="checkbox" [checked]="b.active" (change)="toggle(b)"><span></span></label></div>
      </div>
    </div>
    <div *ngIf="!loading && !banners.length" class="m-empty"><i class="fas fa-images"></i>No banners yet. The site shows its built-in images until you add some.</div>
    <button class="m-fab" (click)="add()" aria-label="Add banner"><i class="fas fa-plus"></i></button>

    <div class="m-sheet-overlay" *ngIf="form" (click)="close()">
      <div class="m-bottom-sheet" (click)="$event.stopPropagation()">
        <div class="m-grip"></div>
        <h3 class="m-sheet-h">{{ form.id ? 'Edit banner' : 'New banner' }}</h3>
        <label class="m-label">Where</label>
        <select class="m-input" [(ngModel)]="form.placement"><option *ngFor="let p of placementIds" [value]="p">{{ placement(p) }}</option></select>
        <ng-container *ngIf="form.placement === 'category-top'">
          <label class="m-label">Category (empty = all categories)</label>
          <select class="m-input" [(ngModel)]="form.categoryId"><option [ngValue]="null">All categories</option>
            <option *ngFor="let c of categories" [ngValue]="c.id">{{ c.name }}</option></select>
        </ng-container>
        <label class="m-label">Desktop image *</label>
        <label class="m-upload" [class.busy]="uploading === 'imageDesktop'">
          <img *ngIf="form.imageDesktop" [src]="form.imageDesktop" alt="">
          <span *ngIf="!form.imageDesktop"><i class="fas fa-image"></i> Choose image</span>
          <input type="file" accept="image/*" hidden (change)="upload($event, 'imageDesktop')"></label>
        <label class="m-label">Phone image (optional, portrait)</label>
        <label class="m-upload" [class.busy]="uploading === 'imageMobile'">
          <img *ngIf="form.imageMobile" [src]="form.imageMobile" alt="">
          <span *ngIf="!form.imageMobile"><i class="fas fa-mobile-alt"></i> Choose image</span>
          <input type="file" accept="image/*" hidden (change)="upload($event, 'imageMobile')"></label>
        <label class="m-label">Title *</label><input class="m-input" [(ngModel)]="form.title">
        <label class="m-label">Subtitle</label><input class="m-input" [(ngModel)]="form.subtitle">
        <label class="m-label">Tapping it opens</label>
        <select class="m-input" [(ngModel)]="form.linkType"><option value="none">Nothing</option><option value="product">A product</option>
          <option value="category">A category</option><option value="url">A web address</option></select>
        <select *ngIf="form.linkType === 'product'" class="m-input mt-2" [(ngModel)]="form.linkTarget">
          <option *ngFor="let p of products" [value]="p.id">{{ p.name }}</option></select>
        <select *ngIf="form.linkType === 'category'" class="m-input mt-2" [(ngModel)]="form.linkTarget">
          <option *ngFor="let c of categories" [value]="c.id">{{ c.name }}</option></select>
        <input *ngIf="form.linkType === 'url'" class="m-input mt-2" [(ngModel)]="form.linkTarget" placeholder="https://… or /contact">
        <div class="m-inline">
          <div><label class="m-label">Order</label><input class="m-input" type="number" [(ngModel)]="form.sortOrder"></div>
          <div><label class="m-label">&nbsp;</label><label class="m-switch"><input type="checkbox" [(ngModel)]="form.active"><span></span><b>Live</b></label></div>
        </div>
        <div *ngIf="formError" class="m-alert bad mt-2">{{ formError }}</div>
        <div class="m-btn-row mt-3">
          <button *ngIf="form.id" class="m-btn danger-ghost" (click)="remove()" [disabled]="saving"><i class="fas fa-trash"></i></button>
          <button class="m-btn ghost" (click)="close()">Cancel</button>
          <button class="m-btn primary" (click)="save()" [disabled]="saving || !!uploading">Save</button>
        </div>
      </div>
    </div>
  </div>
  `
})
export class MBannersComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly catalogApi = inject(AdminCatalogApi);
  private readonly toaster = inject(ToasterService);
  banners: Banner[] = [];
  placementIds = Object.keys(PLACEMENTS);
  categories: Category[] = [];
  products: Product[] = [];
  form: Banner | null = null;
  formError = '';
  uploading = '';
  saving = false;
  loading = false;
  error = '';

  ngOnInit(): void {
    this.load();
    this.api.admin.categories().subscribe({ next: r => (this.categories = r.categories), error: () => {} });
    this.api.admin.products({ size: 200 }).subscribe({ next: r => (this.products = [...r.items].sort((a, b) => a.name.localeCompare(b.name))), error: () => {} });
  }

  placement(p: string): string { return PLACEMENTS[p] ?? p; }

  load(): void {
    this.loading = true;
    this.catalogApi.banners().subscribe({
      next: r => { this.banners = [...r.banners].sort((a, b) => a.placement.localeCompare(b.placement) || a.sortOrder - b.sortOrder); this.loading = false; },
      error: e => { this.error = apiErrorMessage(e, 'Could not load banners'); this.loading = false; }
    });
  }

  add(): void {
    this.formError = '';
    this.form = { title: '', subtitle: '', placement: 'home-hero', categoryId: null, imageDesktop: '', imageMobile: '', altText: '',
      linkType: 'none', linkTarget: null, ctaLabel: '', sortOrder: this.banners.length + 1, active: true, startAt: null, endAt: null };
  }

  edit(b: Banner): void { this.formError = ''; this.form = structuredClone(b); }
  close(): void { if (!this.saving && !this.uploading) this.form = null; }

  async upload(ev: Event, which: 'imageDesktop' | 'imageMobile'): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.form) return;
    this.uploading = which;
    this.formError = '';
    try { this.form[which] = await this.api.upload(file); }
    catch (e) { this.formError = apiErrorMessage(e, 'Image upload failed'); }
    this.uploading = '';
    input.value = '';
  }

  toggle(b: Banner): void {
    this.catalogApi.updateBanner(b.id!, { ...b, active: !b.active }).subscribe({
      next: s => { Object.assign(b, s); this.toaster.showToast(s.active ? 'Banner is live' : 'Banner switched off', ToastType.Success, 2500); },
      error: e => this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000)
    });
  }

  async save(): Promise<void> {
    const f = this.form;
    if (!f) return;
    if (!f.title.trim()) { this.formError = 'Title is required'; return; }
    if (!f.imageDesktop) { this.formError = 'Add the desktop image'; return; }
    if ((f.linkType === 'product' || f.linkType === 'category' || f.linkType === 'url') && !f.linkTarget) { this.formError = 'Choose what it opens'; return; }
    const body: Banner = { ...f, title: f.title.trim(), imageMobile: f.imageMobile || null, linkTarget: f.linkType === 'none' ? null : f.linkTarget,
      categoryId: f.placement === 'category-top' ? f.categoryId || null : null, sortOrder: Number(f.sortOrder) || 0 };
    this.saving = true;
    try {
      if (body.id) await firstValueFrom(this.catalogApi.updateBanner(body.id, body));
      else await firstValueFrom(this.catalogApi.createBanner(body));
      this.toaster.showToast('Banner saved — the site updates within a minute', ToastType.Success, 3500);
      this.form = null;
      this.load();
    } catch (e) { this.formError = apiErrorMessage(e, 'Could not save the banner'); }
    this.saving = false;
  }

  remove(): void {
    if (!this.form?.id || !confirm('Delete this banner?')) return;
    this.catalogApi.deleteBanner(this.form.id).subscribe({
      next: () => { this.form = null; this.load(); },
      error: e => (this.formError = apiErrorMessage(e))
    });
  }
}

/** Publish the catalogue to the website now, and see when it was last published. */
@Component({
  selector: 'app-m-publish',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="m-page">
    <section class="m-sheet m-center">
      <i class="fas fa-cloud-upload-alt m-big-ico"></i>
      <p class="m-muted">Saving products, categories, banners and recommendations already updates the website. Use this if something looks out of date.</p>
      <button class="m-btn primary block" (click)="publish()" [disabled]="busy()">
        <span *ngIf="busy()" class="spinner-border spinner-border-sm"></span> Publish now</button>
    </section>
    <section class="m-sheet" *ngIf="last() as l">
      <h3 class="m-sheet-h">Last publish</h3>
      <dl class="m-totals">
        <dt>When</dt><dd>{{ l.publishedAt | date:'d MMM y, h:mm a' }}</dd>
        <dt>Products</dt><dd>{{ l.productCount }}</dd>
        <ng-container *ngIf="l.bannerCount !== undefined"><dt>Live banners</dt><dd>{{ l.bannerCount }}</dd></ng-container>
        <ng-container *ngIf="l.seo"><dt>SEO pages</dt><dd>{{ l.seo.pages }}</dd><dt>SEO issues</dt><dd>{{ l.seo.issues }}</dd></ng-container>
      </dl>
    </section>
  </div>
  `
})
export class MPublishComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);
  readonly last = signal<any>(null);
  readonly busy = signal(false);

  ngOnInit(): void { this.api.admin.lastPublish().subscribe({ next: p => this.last.set(p), error: () => {} }); }

  publish(): void {
    this.busy.set(true);
    this.api.admin.publishNow().subscribe({
      next: p => { this.last.set(p); this.busy.set(false); this.toaster.showToast('Published', ToastType.Success); },
      error: e => { this.busy.set(false); this.toaster.showToast(apiErrorMessage(e, 'Publish failed'), ToastType.Error, 5000); }
    });
  }
}

/** Blog posts: published / draft switch and quick edit of title, summary and photo. */
@Component({
  selector: 'app-m-blogs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="m-page">
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div class="m-list">
      <div *ngFor="let b of blogs" class="m-card m-prod-card" [class.dim]="!b.published">
        <img *ngIf="b.image; else noImg" [src]="b.image" alt=""><ng-template #noImg><span class="m-noimg"><i class="fas fa-blog"></i></span></ng-template>
        <div class="m-prod-body" (click)="edit(b)"><b>{{ b.title }}</b><small>{{ b.publishDate | date:'d MMM y' }} · {{ b.published ? 'Published' : 'Draft' }}</small></div>
        <label class="m-switch sm"><input type="checkbox" [checked]="b.published" (change)="togglePublished(b)"><span></span></label>
      </div>
    </div>
    <div *ngIf="!blogs.length && !error" class="m-empty"><i class="fas fa-blog"></i>No blog posts.</div>

    <div class="m-sheet-overlay" *ngIf="form" (click)="form = null">
      <div class="m-bottom-sheet" (click)="$event.stopPropagation()">
        <div class="m-grip"></div>
        <h3 class="m-sheet-h">Edit post</h3>
        <label class="m-upload" [class.busy]="uploading"><img *ngIf="form.image" [src]="form.image" alt="">
          <span *ngIf="!form.image"><i class="fas fa-image"></i> Choose image</span>
          <input type="file" accept="image/*" hidden (change)="upload($event)"></label>
        <label class="m-label">Title</label><input class="m-input" [(ngModel)]="form.title">
        <label class="m-label">Summary</label><textarea class="m-input" rows="3" [(ngModel)]="form.excerpt"></textarea>
        <p class="m-hint">The article text is edited on the desktop view.</p>
        <div class="m-btn-row"><button class="m-btn ghost" (click)="form = null">Cancel</button>
          <button class="m-btn primary" (click)="save()" [disabled]="saving || uploading">Save</button></div>
      </div>
    </div>
  </div>
  `
})
export class MBlogsComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);
  blogs: Blog[] = [];
  form: Blog | null = null;
  error = '';
  saving = false;
  uploading = false;

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.admin.blogs().subscribe({ next: r => (this.blogs = r.blogs), error: e => (this.error = apiErrorMessage(e, 'Could not load blogs')) });
  }

  edit(b: Blog): void { this.form = structuredClone(b); }

  togglePublished(b: Blog): void {
    this.api.admin.updateBlog(b.slug, { ...b, published: !b.published }).subscribe({
      next: s => Object.assign(b, s),
      error: e => this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000)
    });
  }

  async upload(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.form) return;
    this.uploading = true;
    try { this.form.image = await this.api.upload(file); }
    catch (e) { this.toaster.showToast(apiErrorMessage(e, 'Image upload failed'), ToastType.Error, 5000); }
    this.uploading = false;
  }

  save(): void {
    const f = this.form;
    if (!f) return;
    this.saving = true;
    this.api.admin.updateBlog(f.slug, f).subscribe({
      next: () => { this.saving = false; this.form = null; this.load(); this.toaster.showToast('Saved', ToastType.Success); },
      error: e => { this.saving = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}

/** "You may also like" / "Bought together" for one product: pick the product, then add or remove suggestions. */
@Component({
  selector: 'app-m-recommendations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="m-page has-sticky">
    <label class="m-label">Product</label>
    <select class="m-input" [(ngModel)]="sourceId" (ngModelChange)="pick()">
      <option value="">Choose a product…</option><option *ngFor="let p of products" [value]="p.id">{{ p.name }}</option></select>
    <ng-container *ngIf="source">
      <div class="m-chips mt-3">
        <button [class.on]="type === 'related'" (click)="type = 'related'">Related ({{ related.length }})</button>
        <button [class.on]="type === 'together'" (click)="type = 'together'">Bought together ({{ together.length }})</button>
      </div>
      <div class="m-list">
        <div *ngFor="let id of current" class="m-row">
          <div class="m-row-main"><b>{{ nameOf(id) }}</b></div>
          <button class="m-icon-btn" (click)="removeId(id)" aria-label="Remove"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <p *ngIf="!current.length" class="m-hint">None picked — the website fills "related" from the same category.</p>
      <div class="m-search mt-2"><i class="fas fa-plus"></i><input type="search" [(ngModel)]="q" placeholder="Add a product…"></div>
      <div class="m-list" *ngIf="q.trim()">
        <button *ngFor="let p of candidates" class="m-row" (click)="addId(p.id)"><div class="m-row-main"><b>{{ p.name }}</b></div><i class="fas fa-plus"></i></button>
      </div>
      <div class="m-sticky"><button class="m-btn primary block" (click)="save()" [disabled]="saving">Save</button></div>
    </ng-container>
  </div>
  `
})
export class MRecommendationsComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);
  products: Product[] = [];
  sourceId = '';
  source: Product | null = null;
  related: string[] = [];
  together: string[] = [];
  type: 'related' | 'together' = 'related';
  q = '';
  saving = false;

  get current(): string[] { return this.type === 'related' ? this.related : this.together; }
  get candidates(): Product[] {
    const n = this.q.trim().toLowerCase();
    return this.products.filter(p => p.id !== this.sourceId && !this.current.includes(p.id) && p.name.toLowerCase().includes(n)).slice(0, 12);
  }

  async ngOnInit(): Promise<void> {
    this.products = (await loadAllProducts(this.api)).sort((a, b) => a.name.localeCompare(b.name));
  }

  nameOf(id: string): string { return this.products.find(p => p.id === id)?.name ?? id; }

  pick(): void {
    this.source = this.products.find(p => p.id === this.sourceId) ?? null;
    this.related = [...((this.source as any)?.relatedProductIds ?? [])];
    this.together = [...((this.source as any)?.boughtTogetherIds ?? [])];
  }

  addId(id: string): void { this.current.push(id); this.q = ''; }
  removeId(id: string): void {
    if (this.type === 'related') this.related = this.related.filter(x => x !== id);
    else this.together = this.together.filter(x => x !== id);
  }

  save(): void {
    if (!this.source) return;
    this.saving = true;
    this.api.admin.setRecommendations(this.source.id, { relatedProductIds: this.related, boughtTogetherIds: this.together }).subscribe({
      next: p => { this.saving = false; Object.assign(this.source!, p); this.toaster.showToast('Saved — the website updates within a minute', ToastType.Success, 3500); },
      error: e => { this.saving = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}
