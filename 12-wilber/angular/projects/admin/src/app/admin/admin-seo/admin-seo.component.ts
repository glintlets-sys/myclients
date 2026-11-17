import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/admin-api';
import { SessionService } from '@shared/core/session.service';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { Blog, CatalogPointer, Category, Product, SeoIssue, SeoReport } from '@shared/core/models';
import {
  SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, blogSeoDescription, blogSeoTitle, categorySeoDescription, categorySeoTitle,
  productSeoDescription, productSeoTitle
} from '@shared/core/seo-rules';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { SeoFieldsComponent, seoConfig } from './seo-fields.component';
import { environment } from '../../../environments/environment';

type Kind = 'product' | 'category' | 'blog';

interface Row {
  kind: Kind;
  key: string;
  name: string;
  path: string;
  title: string;
  description: string;
  explicit: boolean;
  seoTitle?: string;
  seoDescription?: string;
  texts: (string | undefined)[];
  active: boolean;
}

interface SiteSeo {
  enabled: boolean;
  homeTitle?: string;
  homeDescription?: string;
  catalogPath?: string;
  catalogTitle?: string;
  catalogDescription?: string;
  blogsTitle?: string;
  blogsDescription?: string;
  defaultImage?: string;
  twitterHandle?: string;
  locale?: string;
}

/**
 * Publish & SEO: last publish, Publish now, sitemap/robots links, the server-side SEO issue report
 * (GET /v1/admin/seo/report, computed at every publish), site-wide SEO settings and per-item SEO titles/descriptions.
 */
@Component({
  selector: 'app-admin-seo',
  standalone: true,
  imports: [CommonModule, FormsModule, SeoFieldsComponent],
  template: `
  <div class="d-flex justify-content-between flex-wrap align-items-center pt-3 pb-2 mb-3 border-bottom gap-2">
    <h1 class="h2 mb-0">Publish &amp; SEO</h1>
    <button type="button" class="btn btn-primary" (click)="publishNow()" [disabled]="publishing()">
      <i class="fas me-2" [class.fa-cloud-upload-alt]="!publishing()" [class.fa-sync-alt]="publishing()" [class.fa-spin]="publishing()"></i>
      {{ publishing() ? 'Publishing…' : 'Publish now' }}
    </button>
  </div>

  <div class="row g-3 mb-4">
    <div class="col-md-3 col-6"><div class="card h-100"><div class="card-body">
      <div class="text-muted small">Last publish</div>
      <div class="fw-semibold">{{ last()?.publishedAt ? (last()!.publishedAt | date:'medium') : 'Never' }}</div>
      <div class="text-muted small" *ngIf="last()?.version">version {{ last()!.version }}</div>
    </div></div></div>
    <div class="col-md-3 col-6"><div class="card h-100"><div class="card-body">
      <div class="text-muted small">Products published</div>
      <div class="fs-4 fw-semibold">{{ last()?.productCount ?? '—' }}</div>
    </div></div></div>
    <div class="col-md-3 col-6"><div class="card h-100"><div class="card-body">
      <div class="text-muted small">SEO pages</div>
      <div class="fs-4 fw-semibold">{{ report()?.enabled === false ? 'off' : (report()?.pages ?? '—') }}</div>
      <div class="small" *ngIf="report()?.shell === 'fallback'"><span class="badge bg-warning text-dark">storefront shell missing</span></div>
    </div></div></div>
    <div class="col-md-3 col-6"><div class="card h-100"><div class="card-body">
      <div class="text-muted small">Issues</div>
      <div class="fs-6">
        <span class="badge bg-danger me-1">{{ report()?.counts?.error ?? 0 }} errors</span>
        <span class="badge bg-warning text-dark me-1">{{ report()?.counts?.warning ?? 0 }} warnings</span>
        <span class="badge bg-secondary">{{ report()?.counts?.info ?? 0 }} tips</span>
      </div>
    </div></div></div>
  </div>

  <div class="card mb-4" *ngIf="report()?.enabled !== false">
    <div class="card-body d-flex flex-wrap gap-3 align-items-center">
      <span class="text-muted">Search engines:</span>
      <a *ngIf="report()?.sitemapUrl" [href]="report()!.sitemapUrl" target="_blank" rel="noopener"><i class="fas fa-sitemap me-1"></i>sitemap.xml</a>
      <a *ngIf="report()?.robotsUrl" [href]="report()!.robotsUrl" target="_blank" rel="noopener"><i class="fas fa-robot me-1"></i>robots.txt</a>
      <span class="small text-muted" *ngIf="report()?.cdnSitemapUrl">
        (as published on the CDN: <a [href]="report()!.cdnSitemapUrl" target="_blank" rel="noopener">sitemap</a>,
        <a [href]="report()!.cdnRobotsUrl" target="_blank" rel="noopener">robots</a>)
      </span>
      <span class="small text-muted ms-auto" *ngIf="report()?.generatedAt">report from {{ report()!.generatedAt | date:'medium' }}</span>
    </div>
  </div>
  <div class="alert alert-secondary" *ngIf="report()?.enabled === false">
    SEO pages are switched off for this store: no pre-rendered pages, sitemap or robots.txt are published.
  </div>

  <!-- Issues -->
  <div class="card mb-4">
    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
      <h5 class="mb-0">SEO issues</h5>
      <div class="btn-group btn-group-sm">
        <button class="btn" [class.btn-primary]="!showTips()" [class.btn-outline-primary]="showTips()" (click)="showTips.set(false)">Errors &amp; warnings</button>
        <button class="btn" [class.btn-primary]="showTips()" [class.btn-outline-primary]="!showTips()" (click)="showTips.set(true)">All, incl. tips</button>
      </div>
    </div>
    <div class="card-body p-0">
      <div class="p-3 text-muted" *ngIf="!visibleIssues().length">{{ report()?.generatedAt ? 'Nothing to fix.' : 'Publish once to get the report.' }}</div>
      <div class="table-responsive" *ngIf="visibleIssues().length">
        <table class="table table-sm align-middle mb-0">
          <thead><tr><th></th><th>Page</th><th>Issue</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let i of visibleIssues()">
              <td><span class="badge" [ngClass]="i.severity === 'error' ? 'bg-danger' : i.severity === 'warning' ? 'bg-warning text-dark' : 'bg-secondary'">{{ i.severity }}</span></td>
              <td><span class="text-muted small text-capitalize">{{ i.kind }}</span><br>{{ i.name }}</td>
              <td class="small">{{ i.message }}</td>
              <td class="text-nowrap">
                <button class="btn btn-sm btn-outline-primary me-1" *ngIf="rowFor(i) as r" (click)="edit(r)">Edit SEO</button>
                <a class="btn btn-sm btn-link" *ngIf="i.path" [href]="siteUrl() + i.path" target="_blank" rel="noopener">View</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="p-2 small text-muted" *ngIf="report()?.truncated">Showing the first {{ report()?.issues?.length }} of {{ report()?.issueCount }} issues.</div>
    </div>
  </div>

  <!-- Per-page SEO -->
  <div class="card mb-4">
    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
      <ul class="nav nav-tabs card-header-tabs">
        <li class="nav-item" *ngFor="let t of tabs()">
          <button class="nav-link" [class.active]="tab() === t.kind" (click)="tab.set(t.kind)">{{ t.label }}</button>
        </li>
      </ul>
      <input class="form-control form-control-sm" style="max-width:220px" placeholder="Search" [ngModel]="query()" (ngModelChange)="query.set($event)">
    </div>
    <div class="card-body p-0">
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
          <thead><tr><th>Name</th><th>Title</th><th class="text-end">Description</th><th></th></tr></thead>
          <tbody>
            <ng-container *ngFor="let r of visibleRows()">
              <tr [class.table-active]="editing()?.key === r.key">
                <td>{{ r.name }} <span class="badge bg-light text-muted" *ngIf="!r.active">hidden</span></td>
                <td class="small">
                  <span [class.text-danger]="r.title.length > titleMax">{{ r.title }}</span>
                  <span class="text-muted"> · {{ r.title.length }}</span>
                </td>
                <td class="text-end small text-nowrap">
                  <span *ngIf="!r.description" class="text-danger">missing</span>
                  <span *ngIf="r.description">{{ r.description.length }} {{ r.explicit ? '' : '(page text)' }}</span>
                </td>
                <td class="text-end"><button class="btn btn-sm btn-outline-primary" (click)="edit(r)">Edit SEO</button></td>
              </tr>
              <tr *ngIf="editing()?.key === r.key">
                <td colspan="4" class="bg-light">
                  <app-seo-fields [(seoTitle)]="draftTitle" [(seoDescription)]="draftDescription" [kind]="r.kind"
                                  [name]="r.name" [texts]="r.texts" [path]="r.path"></app-seo-fields>
                  <div class="d-flex gap-2 justify-content-end mt-2">
                    <button class="btn btn-sm btn-secondary" (click)="editing.set(null)" [disabled]="saving()">Cancel</button>
                    <button class="btn btn-sm btn-primary" (click)="save(r)" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
                  </div>
                </td>
              </tr>
            </ng-container>
            <tr *ngIf="!visibleRows().length"><td colspan="4" class="p-3 text-muted">Nothing here.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Site-wide settings -->
  <div class="card mb-4" *ngIf="canSettings && site()">
    <div class="card-header"><h5 class="mb-0">Site-wide SEO</h5></div>
    <div class="card-body">
      <div class="form-check form-switch mb-3">
        <input class="form-check-input" type="checkbox" id="seoEnabled" [(ngModel)]="site()!.enabled">
        <label class="form-check-label" for="seoEnabled">Publish search-engine pages, sitemap.xml and robots.txt</label>
      </div>
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Home page title <small class="text-muted">({{ (site()!.homeTitle || storeName()).length }} / {{ titleMax }})</small></label>
          <input class="form-control" [(ngModel)]="site()!.homeTitle" [placeholder]="storeName()">
        </div>
        <div class="col-md-6">
          <label class="form-label">Home page description <small class="text-muted">({{ (site()!.homeDescription || '').length }} / {{ descriptionMax }})</small></label>
          <input class="form-control" [(ngModel)]="site()!.homeDescription" placeholder="store name + categories">
        </div>
        <div class="col-md-6">
          <label class="form-label">Products listing ({{ site()!.catalogPath || '/stone-solutions' }}) title</label>
          <input class="form-control" [(ngModel)]="site()!.catalogTitle" placeholder="Products">
        </div>
        <div class="col-md-6">
          <label class="form-label">Products listing description</label>
          <input class="form-control" [(ngModel)]="site()!.catalogDescription" placeholder="from the category names">
        </div>
        <div class="col-md-6">
          <label class="form-label">Blog listing title</label>
          <input class="form-control" [(ngModel)]="site()!.blogsTitle" placeholder="Blogs">
        </div>
        <div class="col-md-6">
          <label class="form-label">Blog listing description</label>
          <input class="form-control" [(ngModel)]="site()!.blogsDescription" placeholder="from the latest posts">
        </div>
        <div class="col-md-6">
          <label class="form-label">Default share image (absolute URL)</label>
          <input class="form-control" [(ngModel)]="site()!.defaultImage" placeholder="store logo">
        </div>
        <div class="col-md-6">
          <label class="form-label">Twitter / X handle</label>
          <input class="form-control" [(ngModel)]="site()!.twitterHandle" placeholder="@yourstore">
        </div>
      </div>
      <div class="d-flex justify-content-end mt-3">
        <button class="btn btn-primary" (click)="saveSite()" [disabled]="saving()">Save &amp; republish</button>
      </div>
    </div>
  </div>
  `
})
export class AdminSeoComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly session = inject(SessionService);
  private readonly toaster = inject(ToasterService);

  readonly titleMax = SEO_TITLE_MAX;
  readonly descriptionMax = SEO_DESCRIPTION_MAX;
  readonly canSettings = this.session.can('settings');
  readonly canCategories = this.session.can('categories');
  readonly canBlogs = this.session.can('blogs');

  readonly last = signal<CatalogPointer | null>(null);
  readonly report = signal<SeoReport | null>(null);
  readonly publishing = signal(false);
  readonly saving = signal(false);
  readonly showTips = signal(false);
  readonly storeName = signal('');
  readonly siteUrl = signal((environment.storefrontUrl || '').replace(/\/+$/, ''));
  readonly site = signal<SiteSeo | null>(null);

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly blogs = signal<Blog[]>([]);
  readonly tab = signal<Kind>('product');
  readonly query = signal('');
  readonly editing = signal<Row | null>(null);
  draftTitle: string | undefined = '';
  draftDescription: string | undefined = '';

  readonly tabs = computed(() => [
    { kind: 'product' as Kind, label: `Products (${this.products().length})` },
    ...(this.canCategories ? [{ kind: 'category' as Kind, label: `Categories (${this.categories().length})` }] : []),
    ...(this.canBlogs ? [{ kind: 'blog' as Kind, label: `Blogs (${this.blogs().length})` }] : []),
  ]);

  readonly rows = computed<Row[]>(() => {
    const store = this.storeName();
    const out: Row[] = [];
    for (const p of this.products()) out.push({
      kind: 'product', key: 'product:' + p.id, name: p.name, path: '/product/' + p.slug, active: p.active !== false,
      title: productSeoTitle(p, store), description: productSeoDescription(p), explicit: !!p.seoDescription?.trim(),
      seoTitle: p.seoTitle, seoDescription: p.seoDescription, texts: [p.shortDescription, p.description]
    });
    for (const c of this.categories()) out.push({
      kind: 'category', key: 'category:' + c.id, name: c.name, path: '/category/' + c.slug, active: c.active !== false,
      title: categorySeoTitle(c, store), description: categorySeoDescription(c, store), explicit: !!c.seoDescription?.trim(),
      seoTitle: c.seoTitle, seoDescription: c.seoDescription, texts: [c.description]
    });
    for (const b of this.blogs()) out.push({
      kind: 'blog', key: 'blog:' + b.slug, name: b.title, path: '/blog/' + b.slug, active: b.published !== false,
      title: blogSeoTitle(b, store), description: blogSeoDescription(b), explicit: !!b.seoDescription?.trim(),
      seoTitle: b.seoTitle, seoDescription: b.seoDescription, texts: [b.excerpt, b.content]
    });
    return out;
  });

  readonly visibleRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter(r => r.kind === this.tab() && (!q || r.name.toLowerCase().includes(q) || r.path.includes(q)));
  });

  readonly visibleIssues = computed<SeoIssue[]>(() =>
    (this.report()?.issues ?? []).filter(i => this.showTips() || i.severity !== 'info'));

  ngOnInit(): void {
    seoConfig(this.api).subscribe(c => {
      this.storeName.set(c?.store?.name ?? '');
      if (c?.seo?.siteUrl) this.siteUrl.set(c.seo.siteUrl.replace(/\/+$/, ''));
    });
    this.loadStatus();
    this.loadProducts();
    if (this.canCategories) this.api.admin.categories().subscribe({ next: r => this.categories.set(r.categories ?? []), error: () => {} });
    if (this.canBlogs) this.api.admin.blogs().subscribe({ next: r => this.blogs.set(r.blogs ?? []), error: () => {} });
    if (this.canSettings) this.api.admin.settings().subscribe({
      next: s => this.site.set({ enabled: true, ...(s?.seo ?? {}) }),
      error: () => {}
    });
  }

  /** All products (the admin list is paged at 200). */
  private async loadProducts(): Promise<void> {
    const all: Product[] = [];
    try {
      for (let page = 0; page < 50; page++) {
        const r = await firstValueFrom(this.api.admin.products({ page, size: 200 }));
        all.push(...(r.items ?? []));
        if (!r.items?.length || all.length >= r.total) break;
      }
    } catch { /* keep what we have */ }
    this.products.set(all);
  }

  loadStatus(): void {
    this.api.admin.lastPublish().subscribe({ next: p => this.last.set(p), error: () => {} });
    this.api.admin.seoReport().subscribe({ next: r => this.report.set(r), error: () => {} });
  }

  publishNow(): void {
    this.publishing.set(true);
    this.api.admin.publishNow().subscribe({
      next: p => {
        this.publishing.set(false);
        this.last.set(p);
        const seo = p?.seo;
        this.toaster.showToast(seo?.error ? 'Catalog published; SEO pages failed: ' + seo.error
          : `Published${seo?.pages != null ? ` · ${seo.pages} SEO pages` : ''}`, seo?.error ? ToastType.Warn : ToastType.Success);
        this.api.admin.seoReport().subscribe({ next: r => this.report.set(r), error: () => {} });
      },
      error: err => {
        this.publishing.set(false);
        this.toaster.showToast(apiErrorMessage(err, 'Publish failed'), ToastType.Error);
      }
    });
  }

  rowFor(i: SeoIssue): Row | undefined {
    if (!i.id) return undefined;
    return this.rows().find(r => r.kind === i.kind && (r.key === `${i.kind}:${i.id}`));
  }

  edit(r: Row): void {
    this.tab.set(r.kind);
    this.query.set('');
    this.draftTitle = r.seoTitle ?? '';
    this.draftDescription = r.seoDescription ?? '';
    this.editing.set(r);
  }

  async save(r: Row): Promise<void> {
    const seoTitle = this.draftTitle?.trim() || undefined;
    const seoDescription = this.draftDescription?.trim() || undefined;
    this.saving.set(true);
    try {
      const id = r.key.substring(r.kind.length + 1);
      if (r.kind === 'product') {
        // Whole-product PUT: start from the stored product so nothing else changes.
        const full = await firstValueFrom(this.api.admin.product(id));
        const saved = await firstValueFrom(this.api.admin.updateProduct(id, { ...full, seoTitle, seoDescription }));
        this.products.update(ps => ps.map(p => (p.id === id ? { ...p, ...saved } : p)));
      } else if (r.kind === 'category') {
        const c = this.categories().find(x => x.id === id)!;
        const saved = await firstValueFrom(this.api.admin.updateCategory(id, { ...c, seoTitle, seoDescription }));
        this.categories.update(cs => cs.map(x => (x.id === id ? { ...x, ...saved } : x)));
      } else {
        const b = this.blogs().find(x => x.slug === id)!;
        const saved = await firstValueFrom(this.api.admin.updateBlog(id, { ...b, seoTitle, seoDescription }));
        this.blogs.update(bs => bs.map(x => (x.slug === id ? { ...x, ...saved } : x)));
      }
      this.editing.set(null);
      this.toaster.showToast('Saved — the store republishes in a few seconds', ToastType.Success);
      setTimeout(() => this.loadStatus(), 8000);
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Could not save'), ToastType.Error);
    } finally {
      this.saving.set(false);
    }
  }

  saveSite(): void {
    const s = this.site();
    if (!s) return;
    const clean: any = {};
    // The whole seo section is replaced: blank fields are left out so the server's defaults apply.
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'string') { if (v.trim()) clean[k] = v.trim(); } else if (v != null) clean[k] = v;
    }
    this.saving.set(true);
    this.api.admin.saveSettings({ seo: clean }).subscribe({
      next: res => {
        this.saving.set(false);
        if (res?.seo) this.site.set({ enabled: true, ...res.seo });
        this.toaster.showToast('SEO settings saved — republishing', ToastType.Success);
        setTimeout(() => this.loadStatus(), 8000);
      },
      error: err => {
        this.saving.set(false);
        this.toaster.showToast(apiErrorMessage(err, 'Could not save settings'), ToastType.Error);
      }
    });
  }
}
