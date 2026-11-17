import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiService } from '@shared/core/api.service';
import { Blog, CatalogPointer, Category, Product, ProductCard, PublicConfig, PublishedBanner } from '@shared/core/models';
import { localizeImages } from './local-product-images';

/**
 * Storefront catalog, read from the CDN-published JSON (catalog/<tenant>/latest.json → versioned files) so
 * browsing never hits the API or database. Falls back to the API if the CDN is unreachable.
 */
@Injectable({ providedIn: 'root' })
export class CatalogStoreService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);

  private pointer$?: Observable<CatalogPointer | null>;
  private config$?: Observable<PublicConfig>;
  private categories$?: Observable<Category[]>;
  private products$?: Observable<ProductCard[]>;
  private blogs$?: Observable<Blog[]>;
  private banners$?: Observable<PublishedBanner[]>;
  private readonly productCache = new Map<string, Observable<Product>>();

  /** Latest publish pointer; null means "use the API". */
  pointer(): Observable<CatalogPointer | null> {
    this.pointer$ ??= this.http
      .get<CatalogPointer>(`${environment.cdnUrl}/catalog/${environment.tenant}/latest.json`, { params: { t: Math.floor(Date.now() / 60000) } })
      .pipe(map(p => (p?.base ? p : null)), catchError(() => of(null)), shareReplay(1));
    return this.pointer$;
  }

  config(): Observable<PublicConfig> {
    this.config$ ??= this.fromCdn<PublicConfig>('config.json', () => this.api.config()).pipe(shareReplay(1));
    return this.config$;
  }

  categories(): Observable<Category[]> {
    this.categories$ ??= this.fromCdn<{ categories: Category[] }>('categories.json', () => this.api.categories())
      .pipe(map(r => r.categories), shareReplay(1));
    return this.categories$;
  }

  category(slugOrId: string): Observable<Category | undefined> {
    return this.categories().pipe(map(cs => cs.find(c => c.slug === slugOrId || c.id === slugOrId)));
  }

  /** All product cards (the published list is small and doubles as the search index). */
  products(): Observable<ProductCard[]> {
    this.products$ ??= this.fromCdn<{ products: ProductCard[] }>('products.json',
      () => this.api.products({ size: 200 }).pipe(map(r => ({ products: r.items }))))
      .pipe(map(r => r.products), shareReplay(1));
    return this.products$;
  }

  productsInCategory(slugOrId: string): Observable<ProductCard[]> {
    return this.category(slugOrId).pipe(
      switchMap(c => (c ? this.products().pipe(map(ps => ps.filter(p => p.categoryIds.includes(c.id)))) : of([])))
    );
  }

  search(term: string): Observable<ProductCard[]> {
    const words = term.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return this.products().pipe(map(ps => ps.filter(p => {
      const hay = [p.name, p.code, p.shortDescription, ...(p.tags ?? []), ...p.variants.map(v => v.name)].join(' ').toLowerCase();
      return words.every(w => hay.includes(w));
    })));
  }

  /** Full product page data by slug (CDN), or by id/slug through the API. */
  product(slug: string): Observable<Product> {
    if (!this.productCache.has(slug)) {
      this.productCache.set(slug, this.fromCdn<Product>(`product/${encodeURIComponent(slug)}.json`, () => this.api.product(slug))
        .pipe(shareReplay(1)));
    }
    return this.productCache.get(slug)!;
  }

  productById(id: string): Observable<ProductCard | undefined> {
    return this.products().pipe(map(ps => ps.find(p => p.id === id)));
  }

  /**
   * Live marketing banners for a placement (home-hero, home-strip, category-top), in admin sort order.
   * Empty when nothing is published or banners.json cannot be read, so callers keep their built-in images.
   */
  banners(placement: string): Observable<PublishedBanner[]> {
    this.banners$ ??= this.pointer().pipe(
      switchMap(p => (p?.banners && (p.bannerCount ?? 1) > 0
        ? this.http.get<{ banners: PublishedBanner[] }>(p.banners).pipe(map(r => r.banners ?? []), catchError(() => of([])))
        : of([] as PublishedBanner[]))),
      shareReplay(1)
    );
    return this.banners$.pipe(map(bs => bs
      .filter(b => b.placement === placement && !!b.imageDesktop)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))));
  }

  blogs(): Observable<Blog[]> {
    this.blogs$ ??= this.fromCdn<{ blogs: Blog[] }>('blogs.json', () => this.api.blogs()).pipe(map(r => r.blogs), shareReplay(1));
    return this.blogs$;
  }

  blog(slug: string): Observable<Blog> {
    return this.fromCdn<Blog>(`blog/${encodeURIComponent(slug)}.json`, () => this.api.blog(slug));
  }

  private fromCdn<T>(file: string, fallback: () => Observable<T>): Observable<T> {
    return this.pointer().pipe(
      switchMap(p => (p?.base ? this.http.get<T>(p.base + file).pipe(catchError(err =>
        err?.status === 404 && file.startsWith('product/') ? throwError(() => err) : fallback())) : fallback())),
      // old-site product photos -> bundled web-sized copies (see local-product-images.ts)
      map(data => localizeImages(data))
    );
  }
}
