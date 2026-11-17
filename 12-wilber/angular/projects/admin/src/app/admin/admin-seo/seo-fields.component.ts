import { Component, computed, inject, input, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, of, shareReplay } from 'rxjs';
import { ApiService } from '@shared/core/api.service';
import { PublicConfig } from '@shared/core/models';
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, clip, seoDescription, withStore } from '@shared/core/seo-rules';
import { environment } from '../../../environments/environment';

let config$: Observable<PublicConfig | null> | undefined;

/** Store name + canonical site URL for previews (public config, fetched once per admin session). */
export function seoConfig(api: ApiService): Observable<PublicConfig | null> {
  config$ ??= api.config().pipe(catchError(() => of(null)), shareReplay(1));
  return config$;
}

/**
 * SEO title + description inputs with character counters and a Google-style result preview. Empty fields show the
 * value the storefront / pre-rendered page will actually use (same rules: `@shared/core/seo-rules`).
 *
 *   <app-seo-fields [(seoTitle)]="form.seoTitle" [(seoDescription)]="form.seoDescription" kind="product"
 *                   [name]="form.name" [texts]="[form.shortDescription, form.description]" [path]="'/product/' + form.slug" />
 */
@Component({
  selector: 'app-seo-fields',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="seo-fields">
      <div class="mb-2">
        <label class="form-label d-flex justify-content-between mb-1">
          <span>SEO title</span>
          <small [class.text-danger]="effectiveTitle().length > titleMax" [class.text-muted]="effectiveTitle().length <= titleMax">
            {{ effectiveTitle().length }} / {{ titleMax }}
          </small>
        </label>
        <input class="form-control" [ngModel]="seoTitle() ?? ''" (ngModelChange)="seoTitle.set($event)"
               [ngModelOptions]="{ standalone: true }" [placeholder]="fallbackTitle()" maxlength="200">
        <div class="form-text" *ngIf="!seoTitle()?.trim()">Empty: “{{ fallbackTitle() }}” is used.</div>
      </div>
      <div class="mb-2">
        <label class="form-label d-flex justify-content-between mb-1">
          <span>SEO description</span>
          <small [class.text-danger]="typedDescriptionLength() > descriptionMax" [class.text-warning]="effectiveDescription().length > 0 && effectiveDescription().length < 50"
                 [class.text-muted]="typedDescriptionLength() <= descriptionMax">
            {{ typedDescriptionLength() || effectiveDescription().length }} / {{ descriptionMax }}
          </small>
        </label>
        <textarea class="form-control" rows="2" [ngModel]="seoDescription() ?? ''" (ngModelChange)="seoDescription.set($event)"
                  [ngModelOptions]="{ standalone: true }" [placeholder]="fallbackDescription() || 'Describe this page for search results'"></textarea>
        <div class="form-text" *ngIf="!seoDescription()?.trim()">
          {{ fallbackDescription() ? 'Empty: the page text above is used.' : 'No description yet: search engines will pick some text themselves.' }}
        </div>
        <div class="form-text text-danger" *ngIf="typedDescriptionLength() > descriptionMax">Longer than {{ descriptionMax }} characters: it is cut.</div>
      </div>
      <div class="serp-preview" aria-label="Search result preview">
        <div class="serp-url">{{ host() }}<span *ngFor="let s of crumbs()"> › {{ s }}</span></div>
        <div class="serp-title">{{ previewTitle() }}</div>
        <div class="serp-desc">{{ effectiveDescription() || '—' }}</div>
      </div>
    </div>
  `,
  styles: [`
    .serp-preview { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; background: #fff; font-family: Arial, sans-serif; max-width: 600px; }
    .serp-url { color: #202124; font-size: 13px; line-height: 1.4; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .serp-title { color: #1a0dab; font-size: 19px; line-height: 1.3; margin: 2px 0; }
    .serp-desc { color: #4d5156; font-size: 13.5px; line-height: 1.5; }
  `]
})
export class SeoFieldsComponent {
  private readonly api = inject(ApiService);
  private readonly config = toSignal(seoConfig(this.api), { initialValue: null });

  // any: parents bind string, string | undefined or null fields alike.
  readonly seoTitle = model<any>();
  readonly seoDescription = model<any>();
  /** product | category | blog — category pages get a "Browse <name> from <store>." default. */
  readonly kind = input<'product' | 'category' | 'blog'>('product');
  /** Product/category name or blog title. */
  readonly name = input<string | null | undefined>('');
  /** Fallback texts in rule order (short description / excerpt, then long description / body). */
  readonly texts = input<(string | null | undefined)[]>([]);
  /** Storefront path, e.g. /product/<slug>. */
  readonly path = input<string>('/');

  readonly titleMax = SEO_TITLE_MAX;
  readonly descriptionMax = SEO_DESCRIPTION_MAX;

  readonly storeName = computed(() => this.config()?.store?.name ?? '');
  readonly siteUrl = computed(() => (this.config()?.seo?.siteUrl || environment.storefrontUrl || '').replace(/\/+$/, ''));
  readonly fallbackTitle = computed(() => withStore(this.name(), this.storeName()));
  readonly effectiveTitle = computed(() => this.seoTitle()?.trim() || this.fallbackTitle());
  readonly fallbackDescription = computed(() => {
    const d = seoDescription(...this.texts());
    if (d || this.kind() !== 'category' || !this.name()?.trim()) return d;
    return clip(this.storeName() ? `Browse ${this.name()!.trim()} from ${this.storeName()}.` : `Browse ${this.name()!.trim()}.`);
  });
  readonly effectiveDescription = computed(() => seoDescription(this.seoDescription()) || this.fallbackDescription());
  readonly typedDescriptionLength = computed(() => (this.seoDescription() ?? '').trim().length);
  readonly previewTitle = computed(() => clip(this.effectiveTitle(), SEO_TITLE_MAX));
  readonly host = computed(() => {
    try { return new URL(this.siteUrl()).host; } catch { return this.siteUrl(); }
  });
  readonly crumbs = computed(() => this.path().split('/').filter(Boolean).map(s => decodeURIComponent(s)));
}

/** The slug the API generates from a name when none is given (same as the backend's Ids.slugify). */
export function slugPreview(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}
