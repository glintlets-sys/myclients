import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { Observable, catchError, filter, map, of, shareReplay, take } from 'rxjs';
import { Blog, Category, Product, ProductCard, PublicConfig } from '@shared/core/models';
import {
  blogSeoDescription, blogSeoTitle, categorySeoDescription, categorySeoTitle, clip, homeDescription, listingDescription,
  plainText, productSeoDescription, productSeoTitle, withStore
} from '@shared/core/seo-rules';
import { CatalogStoreService } from './catalog-store.service';

/** Route data `seo`: static pages give a title (and noindex for private pages); 'managed' pages call SeoService. */
export type RouteSeo = 'managed' | { title?: string; description?: string; noindex?: boolean };

export interface SeoPage {
  /** Path of the canonical URL, e.g. /product/adesiva-reg-999 */
  path: string;
  title: string;
  description?: string;
  image?: string | null;
  imageAlt?: string;
  type?: 'website' | 'product' | 'article';
  jsonLd?: object[];
  noindex?: boolean;
  /** Extra Open Graph properties (product:price:amount, article:published_time, …). */
  og?: Record<string, string>;
}

/** Site-wide values, from the public config (same inputs as the publisher's pre-rendered pages). */
interface SeoContext {
  siteUrl: string;
  storeName: string;
  legalName?: string;
  logo?: string;
  phone?: string;
  email?: string;
  currency: string;
  locale: string;
  defaultImage?: string;
  twitter?: string;
  homeTitle: string;
  homeDescription?: string;
  catalogPath: string;
  catalogTitle: string;
  catalogDescription?: string;
  blogsTitle: string;
  blogsDescription?: string;
}

interface Crumb { name: string; path?: string }

const MANAGED_META = [
  'description', 'robots', 'og:site_name', 'og:locale', 'og:type', 'og:title', 'og:description', 'og:url', 'og:image',
  'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:site'
];

/**
 * Keeps title, meta description, canonical, robots, Open Graph / Twitter and JSON-LD right for in-app navigation.
 * Mirrors the backend's SeoPublisher (publish-time pre-rendered pages) and uses the shared rules in
 * `@shared/core/seo-rules`, so a page reads the same to a crawler whether it got the pre-rendered HTML or the app.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly doc = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogStoreService);
  /** Bumped on every navigation / page update so a late async result never overwrites a newer page. */
  private seq = 0;

  private readonly ctx$: Observable<SeoContext> = this.catalog.config().pipe(
    map(c => toContext(c, this.doc.location?.origin ?? '')),
    catchError(() => of(toContext(undefined, this.doc.location?.origin ?? ''))),
    shareReplay(1)
  );

  /** Call once (AppComponent): applies route-level defaults on every navigation. */
  init(): void {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      const seo = deepest(this.router.routerState.snapshot.root)?.data?.['seo'] as RouteSeo | undefined;
      if (seo === 'managed') return; // the page component sets its own tags once its data is loaded
      const path = this.router.url.split(/[?#]/)[0] || '/';
      const token = ++this.seq;
      this.ctx$.pipe(take(1)).subscribe(ctx => {
        if (token !== this.seq) return;
        const title = seo?.title ? withStore(seo.title, ctx.storeName) : ctx.storeName;
        this.apply(ctx, { path, title, description: seo?.description, noindex: seo?.noindex, image: ctx.defaultImage });
      });
    });
  }

  // ---------- page types (same content rules as SeoPublisher) ----------

  home(categories: Category[], products: ProductCard[]): void {
    this.withCtx(ctx => {
      const cats = activeCategories(categories);
      const description = ctx.homeDescription || homeDescription(ctx.storeName, cats.map(c => c.name));
      const org: any = ld('Organization', { name: ctx.storeName, legalName: ctx.legalName, url: ctx.siteUrl + '/', logo: ctx.logo, email: ctx.email });
      if (ctx.phone) {
        org.telephone = ctx.phone;
        org.contactPoint = { '@type': 'ContactPoint', telephone: ctx.phone, contactType: 'customer service', email: ctx.email };
      }
      return {
        path: '/', title: ctx.homeTitle, description, image: ctx.defaultImage, imageAlt: ctx.storeName,
        jsonLd: [org, ld('WebSite', { name: ctx.storeName, url: ctx.siteUrl + '/' })]
      };
    });
  }

  catalogListing(categories: Category[]): void {
    this.withCtx(ctx => {
      const cats = activeCategories(categories);
      const title = withStore(ctx.catalogTitle, ctx.storeName);
      const description = ctx.catalogDescription || listingDescription(ctx.catalogTitle, ctx.storeName, cats.map(c => c.name));
      const crumbs = [{ name: 'Home', path: '/' }, { name: ctx.catalogTitle, path: ctx.catalogPath }];
      const items = cats.map((c, i) => listItem(i + 1, c.name, ctx.siteUrl + categoryPath(c)));
      return {
        path: ctx.catalogPath, title, description, image: ctx.defaultImage, imageAlt: ctx.catalogTitle,
        jsonLd: [collectionPage(title, description, ctx.siteUrl + ctx.catalogPath, items), breadcrumb(ctx, crumbs)]
      };
    });
  }

  blogListing(blogs: Blog[]): void {
    this.withCtx(ctx => {
      const posts = blogs.filter(b => b.published !== false);
      const title = withStore(ctx.blogsTitle, ctx.storeName);
      const description = ctx.blogsDescription || listingDescription(ctx.blogsTitle, ctx.storeName, posts.map(b => b.title), 4);
      const crumbs = [{ name: 'Home', path: '/' }, { name: ctx.blogsTitle, path: '/blogs' }];
      const items = posts.map((b, i) => listItem(i + 1, b.title, ctx.siteUrl + blogPath(b)));
      return {
        path: '/blogs', title, description, image: ctx.defaultImage, imageAlt: ctx.blogsTitle,
        jsonLd: [collectionPage(title, description, ctx.siteUrl + '/blogs', items), breadcrumb(ctx, crumbs)]
      };
    });
  }

  category(c: Category, all: Category[], products: ProductCard[]): void {
    this.withCtx(ctx => {
      const path = categoryPath(c);
      const title = categorySeoTitle(c, ctx.storeName);
      const description = categorySeoDescription(c, ctx.storeName);
      const image = absolute(ctx.siteUrl, c.image || c.bannerImage);
      const crumbs: Crumb[] = [{ name: 'Home', path: '/' }, { name: ctx.catalogTitle, path: ctx.catalogPath }];
      const parent = c.parentId ? all.find(x => x.id === c.parentId && x.active !== false) : undefined;
      if (parent) crumbs.push({ name: parent.name, path: categoryPath(parent) });
      crumbs.push({ name: c.name, path });
      const items = products.map((p, i) => listItem(i + 1, p.name, ctx.siteUrl + productPath(p)));
      const page: any = collectionPage(title, description, ctx.siteUrl + path, items);
      if (image) page.image = image;
      return { path, title, description, image: image ?? ctx.defaultImage, imageAlt: c.name, jsonLd: [page, breadcrumb(ctx, crumbs)] };
    });
  }

  product(p: Product, category?: Category): void {
    this.withCtx(ctx => {
      const path = productPath(p);
      const title = productSeoTitle(p, ctx.storeName);
      const description = productSeoDescription(p);
      const images: string[] = [];
      for (const u of [...(p.images ?? []), p.thumbnail]) {
        const a = absolute(ctx.siteUrl, u);
        if (a && !images.includes(a)) images.push(a);
      }
      const variants = (p.variants ?? []).filter(v => v.active !== false);
      const min = variants.length ? Math.min(...variants.map(v => v.pricePaise)) : 0;
      const inStock = variants.some(v => v.inStock === true);
      const cheapest = variants.find(v => v.pricePaise === min);
      const crumbs: Crumb[] = [{ name: 'Home', path: '/' },
        category ? { name: category.name, path: categoryPath(category) } : { name: ctx.catalogTitle, path: ctx.catalogPath },
        { name: p.name, path }];
      const sku = p.code || (variants.length === 1 ? variants[0].sku : undefined);
      const longText = clip(plainText(p.description || p.shortDescription || description), 5000);
      const product: any = ld('Product', {
        name: p.name, description: longText || undefined, image: images.length ? images : undefined, sku, url: ctx.siteUrl + path,
        category: category?.name, brand: { '@type': 'Brand', name: p.brand || ctx.storeName }
      });
      const og: Record<string, string> = {};
      if (min > 0) {
        const price = (min / 100).toFixed(2);
        product.offers = clean({
          '@type': 'Offer', url: ctx.siteUrl + path, priceCurrency: ctx.currency, price,
          availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition', sku: cheapest?.sku || undefined,
          seller: { '@type': 'Organization', name: ctx.storeName }
        });
        og['product:price:amount'] = price;
        og['product:price:currency'] = ctx.currency;
        og['product:availability'] = inStock ? 'in stock' : 'out of stock';
      }
      if (p.rating && p.rating.count > 0 && p.rating.average > 0) {
        product.aggregateRating = { '@type': 'AggregateRating', ratingValue: Math.round(p.rating.average * 10) / 10,
          reviewCount: p.rating.count, bestRating: 5, worstRating: 1 };
      }
      return {
        path, title, description, image: images[0] ?? ctx.defaultImage, imageAlt: p.name, type: 'product', og,
        jsonLd: [product, breadcrumb(ctx, crumbs)]
      };
    });
  }

  blog(b: Blog): void {
    this.withCtx(ctx => {
      const path = blogPath(b);
      const title = blogSeoTitle(b, ctx.storeName);
      const description = blogSeoDescription(b);
      const image = absolute(ctx.siteUrl, b.image);
      const published = normDate(b.publishDate || b.createdAt);
      const modified = normDate(b.updatedAt || b.publishDate);
      const post: any = ld('BlogPosting', {
        headline: clip(b.title, 110), description: description || undefined, image: image ? [image] : undefined,
        datePublished: published, dateModified: modified,
        author: b.author?.trim() ? { '@type': 'Person', name: b.author.trim() } : { '@type': 'Organization', name: ctx.storeName },
        publisher: clean({ '@type': 'Organization', name: ctx.storeName, logo: ctx.logo ? { '@type': 'ImageObject', url: ctx.logo } : undefined }),
        mainEntityOfPage: { '@type': 'WebPage', '@id': ctx.siteUrl + path },
        articleSection: b.category || undefined, keywords: b.tags?.length ? b.tags.join(', ') : undefined
      });
      const og: Record<string, string> = {};
      if (published) og['article:published_time'] = published;
      if (modified) og['article:modified_time'] = modified;
      const crumbs = [{ name: 'Home', path: '/' }, { name: ctx.blogsTitle, path: '/blogs' }, { name: b.title, path }];
      return { path, title, description, image: image ?? ctx.defaultImage, imageAlt: b.title, type: 'article', og, jsonLd: [post, breadcrumb(ctx, crumbs)] };
    });
  }

  /** A page whose item does not exist: keep it out of the index. */
  notFound(path: string): void {
    this.withCtx(ctx => ({ path, title: withStore('Not found', ctx.storeName), noindex: true }));
  }

  // ---------- tag writing ----------

  private withCtx(build: (ctx: SeoContext) => SeoPage): void {
    const token = ++this.seq;
    this.ctx$.pipe(take(1)).subscribe(ctx => {
      if (token === this.seq) this.apply(ctx, build(ctx));
    });
  }

  private apply(ctx: SeoContext, p: SeoPage): void {
    const canonical = ctx.siteUrl + p.path;
    const description = p.description ?? '';
    const image = p.image ?? undefined;
    this.title.setTitle(p.title);
    for (const key of MANAGED_META) this.removeMeta(key);
    this.doc.head.querySelectorAll('meta[property^="product:"], meta[property^="article:"]').forEach(e => e.remove());

    if (description) this.setMeta('name', 'description', description);
    this.setMeta('name', 'robots', p.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large');
    this.setMeta('property', 'og:site_name', ctx.storeName);
    this.setMeta('property', 'og:locale', ctx.locale);
    this.setMeta('property', 'og:type', p.type ?? 'website');
    this.setMeta('property', 'og:title', p.title);
    if (description) this.setMeta('property', 'og:description', description);
    this.setMeta('property', 'og:url', canonical);
    if (image) {
      this.setMeta('property', 'og:image', image);
      this.setMeta('property', 'og:image:alt', p.imageAlt ?? p.title);
    }
    for (const [k, v] of Object.entries(p.og ?? {})) this.setMeta('property', k, v);
    this.setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    this.setMeta('name', 'twitter:title', p.title);
    if (description) this.setMeta('name', 'twitter:description', description);
    if (image) this.setMeta('name', 'twitter:image', image);
    if (ctx.twitter) this.setMeta('name', 'twitter:site', ctx.twitter);

    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (p.noindex) {
      link?.remove();
    } else {
      if (!link) {
        link = this.doc.createElement('link');
        link.setAttribute('rel', 'canonical');
        this.doc.head.appendChild(link);
      }
      link.setAttribute('href', canonical);
    }

    this.doc.head.querySelectorAll('script[type="application/ld+json"][data-seo]').forEach(e => e.remove());
    for (const node of p.jsonLd ?? []) {
      const s = this.doc.createElement('script');
      s.type = 'application/ld+json';
      s.setAttribute('data-seo', 'ld');
      s.text = JSON.stringify(node).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
      this.doc.head.appendChild(s);
    }
  }

  private setMeta(attr: 'name' | 'property', key: string, content: string): void {
    this.meta.addTag({ [attr]: key, content } as any);
  }

  private removeMeta(key: string): void {
    const attr = key.startsWith('og:') ? 'property' : 'name';
    this.doc.head.querySelectorAll(`meta[${attr}="${key}"]`).forEach(e => e.remove());
  }
}

// ---------- helpers (mirror SeoPublisher) ----------

export function productPath(p: { slug: string }): string { return '/product/' + encodeURIComponent(p.slug); }

export function categoryPath(c: { slug: string }): string { return '/category/' + encodeURIComponent(c.slug); }

export function blogPath(b: { slug: string }): string { return '/blog/' + encodeURIComponent(b.slug); }

function toContext(c: PublicConfig | undefined, origin: string): SeoContext {
  const seo = c?.seo;
  const siteUrl = (seo?.siteUrl || origin).replace(/\/+$/, '');
  const storeName = c?.store?.name?.trim() || 'Store';
  const logo = absolute(siteUrl, c?.store?.logoUrl);
  return {
    siteUrl, storeName, legalName: seo?.legalName || undefined, logo,
    phone: c?.store?.supportPhone || undefined, email: c?.store?.supportEmail || undefined,
    currency: c?.store?.currency || 'INR', locale: seo?.locale || 'en_IN',
    defaultImage: absolute(siteUrl, seo?.defaultImage) ?? logo, twitter: seo?.twitterHandle || undefined,
    homeTitle: seo?.homeTitle?.trim() || storeName, homeDescription: seo?.homeDescription?.trim() || undefined,
    catalogPath: normalizePath(seo?.catalogPath, '/stone-solutions'), catalogTitle: seo?.catalogTitle?.trim() || 'Products',
    catalogDescription: seo?.catalogDescription?.trim() || undefined,
    blogsTitle: seo?.blogsTitle?.trim() || 'Blogs', blogsDescription: seo?.blogsDescription?.trim() || undefined
  };
}

function normalizePath(p: string | undefined, fallback: string): string {
  if (!p) return fallback;
  let s = p.trim().replace(/\/+$/, '');
  if (!s.startsWith('/')) s = '/' + s;
  return /^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(s) && !s.includes('..') ? s : fallback;
}

/** Absolute http(s) URL; relative paths resolved against the site; null for javascript:, data:, … */
export function absolute(siteUrl: string, url: string | null | undefined): string | undefined {
  if (!url || !url.trim()) return undefined;
  const u = url.trim();
  if (u.startsWith('https://') || u.startsWith('http://')) return u.replace(/ /g, '%20');
  if (u.startsWith('//')) return ('https:' + u).replace(/ /g, '%20');
  if (u.includes(':')) return undefined;
  return (siteUrl + '/' + (u.startsWith('/') ? u.substring(1) : u)).replace(/ /g, '%20');
}

function activeCategories(categories: Category[]): Category[] {
  return categories.filter(c => c.active !== false);
}

function normDate(s?: string): string | undefined {
  if (!s) return undefined;
  const v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.substring(0, 10) : undefined;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function ld(type: string, fields: Record<string, unknown>): Record<string, unknown> {
  return clean({ '@context': 'https://schema.org', '@type': type, ...fields });
}

function clean<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || o[k] === '') delete o[k];
  return o;
}

function listItem(position: number, name: string, url: string) {
  return { '@type': 'ListItem', position, url, name };
}

function collectionPage(name: string, description: string, url: string, items: object[]) {
  return ld('CollectionPage', {
    name, description: description || undefined, url,
    mainEntity: { '@type': 'ItemList', numberOfItems: items.length, itemListElement: items }
  });
}

function breadcrumb(ctx: SeoContext, crumbs: Crumb[]) {
  return ld('BreadcrumbList', {
    itemListElement: crumbs.map((c, i) => clean({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.path ? ctx.siteUrl + c.path : undefined }))
  });
}

function deepest(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let r = route;
  while (r.firstChild) r = r.firstChild;
  return r;
}
