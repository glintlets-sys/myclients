import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { map, of, switchMap, catchError, throwError } from 'rxjs';
import { HeaderComponent } from '../shared/header/header.component';
import { FooterComponent } from '../shared/footer/footer.component';
import { CatalogStoreService } from '../core/catalog-store.service';
import { CartStoreService } from '../core/cart-store.service';
import { SeoService } from '../core/seo.service';
import { SessionService } from '@shared/core/session.service';
import { ApiService } from '@shared/core/api.service';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { PriceSlab, Product, ProductCard, Variant } from '@shared/core/models';
import { clampQty, qtyLimits, slabFor, sortedSlabs, unitPriceFor } from '../core/purchase-rules';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

/** Product page view model (the fields the approved template renders). */
interface ProductView {
  id: string;
  slug: string;
  name: string;
  category?: string;
  categoryName?: string;
  /** Parent of the category (e.g. Stone Solutions), for the breadcrumb. */
  parentCategory?: string;
  parentCategoryName?: string;
  image?: string;
  images: string[];
  rating: number;
  reviewCount: number;
  description?: string;
  moreDescription?: string;
  size: string[];
  colors: string[];
  packagingType?: string;
  features: string[];
  applications: string[];
  considerations: string[];
  howToApply: string[];
  specs: { label: string; value: string }[];
  documents: { label: string; url: string }[];
  applicationImage?: string;
  raw: Product;
}

interface RelatedView {
  id: string; // slug, used for navigation
  name: string;
  image?: string;
  badge?: string;
  description?: string;
  rating: number;
  categoryIds: string[];
}

const MAX_QTY = 99;
const YOUTUBE_EMBED = /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\/[\w-]+(\?[\w=&-]*)?$/;

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, HeaderComponent, FooterComponent, MoneyPipe],
  templateUrl: './product.component.html',
  styleUrls: ['./product.component.scss']
})
export class ProductComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogStoreService);
  private readonly cart = inject(CartStoreService);
  private readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toaster = inject(ToasterService);
  private readonly seo = inject(SeoService);

  product: ProductView | null = null;
  relatedProducts: RelatedView[] = [];

  /**
   * Heading for the related block. Products picked in admin (Product Recommendations) come first and can be from other
   * categories, so "from <category>" is only claimed when every card really is in this product's category.
   */
  get relatedTitle(): string {
    const own = this.product?.raw?.categoryIds ?? [];
    const sameCategory = this.relatedProducts.length > 0 && this.relatedProducts.every(r => r.categoryIds.some(id => own.includes(id)));
    return sameCategory && this.product?.categoryName ? `More from ${this.product.categoryName}` : 'Related Products';
  }
  loading = true;
  error = false;
  selectedSize = '';
  selectedColor = '';
  quantity = 1;
  isAddedToCart = false;
  stockLoading = false;
  notifyRequested = false;
  readonly availableStock = MAX_QTY;
  videoUrl: SafeResourceUrl | null = null;

  /** "Watch Video": smooth-scroll to the video section on this page (no navigation). */
  scrollToVideo(event: Event) {
    event.preventDefault();
    document.getElementById('videoproplay')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngOnInit() {
    this.route.paramMap.pipe(
      map(params => params.get('slug') ?? ''),
      switchMap(slug => {
        this.loading = true;
        this.error = false;
        return this.catalog.product(slug).pipe(
          // Old links may carry a product id instead of the slug.
          catchError((err: HttpErrorResponse) => this.catalog.productById(slug).pipe(
            switchMap(card => (card && card.slug !== slug ? this.catalog.product(card.slug) : throwError(() => err)))
          )),
          switchMap(product => this.catalog.categories().pipe(
            // The first of the product's categories that is live (same rule as the pre-rendered page).
            map(cats => {
              const category = product.categoryIds.map(id => cats.find(c => c.id === id && c.active !== false)).find(c => !!c);
              const parent = category?.parentId ? cats.find(c => c.id === category.parentId && c.active !== false) : undefined;
              return { product, category, parent };
            }),
            catchError(() => of({ product, category: undefined, parent: undefined }))
          )),
          catchError(err => {
            console.error('Error loading product:', err);
            return of(null);
          })
        ).pipe(map(result => ({ slug, result })));
      })
    ).subscribe(({ slug, result }) => {
      if (!result) {
        this.product = null;
        this.error = true;
        this.loading = false;
        this.seo.notFound('/product/' + encodeURIComponent(slug));
        return;
      }
      if (result.product.slug && result.product.slug !== slug) {
        // Old /product/<id> link: show the canonical /product/<slug> URL instead (no extra history entry).
        this.router.navigate(['/product', result.product.slug], { replaceUrl: true });
        return;
      }
      this.seo.product(result.product, result.category);
      this.setProduct(result.product, result.category?.slug, result.category?.name);
      if (this.product) {
        this.product.parentCategory = result.parent?.slug;
        this.product.parentCategoryName = result.parent?.name;
      }
      this.loading = false;
      setTimeout(() => this.initializeProductFunctionality(), 0);
    });
  }

  private setProduct(p: Product, categorySlug?: string, categoryName?: string) {
    const variants = this.activeVariants(p);
    const images = p.images?.length ? p.images : (p.thumbnail ? [p.thumbnail] : []);
    this.product = {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: categorySlug,
      categoryName,
      image: images[0],
      images,
      rating: Math.round((p.rating?.average ?? 0) * 10) / 10,
      reviewCount: p.rating?.count ?? 0,
      description: p.shortDescription || p.description,
      moreDescription: p.shortDescription ? p.description : undefined,
      size: unique(variants.map(v => v.attributes?.['size'] || v.name)),
      colors: unique(variants.map(v => v.attributes?.['color'] ?? '')),
      packagingType: p.packagingType,
      features: p.features ?? [],
      applications: p.applications ?? [],
      considerations: p.considerations ?? [],
      howToApply: p.howToApply ?? [],
      specs: p.specs ?? [],
      documents: p.documents ?? [],
      applicationImage: p.applicationImage,
      raw: p
    };
    this.videoUrl = p.videoUrl && YOUTUBE_EMBED.test(p.videoUrl)
      ? this.sanitizer.bypassSecurityTrustResourceUrl(p.videoUrl)
      : null;
    const initial = variants.find(v => v.inStock !== false) ?? variants[0];
    this.selectedSize = initial ? (initial.attributes?.['size'] || initial.name) : '';
    this.selectedColor = initial?.attributes?.['color'] ?? '';
    this.quantity = qtyLimits(initial, p).min;
    this.isAddedToCart = false;
    this.notifyRequested = false;
    this.relatedProducts = (p.related ?? []).map(toRelated);
  }

  private activeVariants(p: Product): Variant[] {
    return (p.variants ?? []).filter(v => v.active !== false);
  }

  /** The variant matching the chosen size/colour (falls back to the first variant of that size). */
  get selectedVariant(): Variant | null {
    if (!this.product) return null;
    const variants = this.activeVariants(this.product.raw);
    const sizeOf = (v: Variant) => v.attributes?.['size'] || v.name;
    const bySize = variants.filter(v => !this.selectedSize || sizeOf(v) === this.selectedSize);
    return bySize.find(v => !this.selectedColor || (v.attributes?.['color'] ?? '') === this.selectedColor)
      ?? bySize[0] ?? null;
  }

  /** Order quantity limits of the selected pack size (min/max order quantity). */
  get limits(): { min: number; max: number } {
    const l = qtyLimits(this.selectedVariant, this.product?.raw);
    return { min: l.min, max: Math.min(l.max, this.availableStock) };
  }

  /** Quantity slabs of the selected pack size, ascending. */
  get slabs(): PriceSlab[] {
    return sortedSlabs(this.selectedVariant);
  }

  get activeSlab(): PriceSlab | null {
    return slabFor(this.selectedVariant, this.quantity);
  }

  /** Display price per unit for the chosen quantity (the cart is re-priced by the server). */
  get unitPrice(): number {
    return unitPriceFor(this.selectedVariant, this.quantity);
  }

  slabSavingPct(s: PriceSlab): number {
    const base = this.selectedVariant?.pricePaise ?? 0;
    return base > 0 ? Math.round(((base - s.unitPricePaise) / base) * 100) : 0;
  }

  /** A different pack size may have different limits: keep the quantity inside them. */
  onVariantChange(): void {
    this.quantity = clampQty(this.quantity, this.limits);
  }

  get isInStock(): boolean {
    const v = this.selectedVariant;
    return !!v && v.inStock !== false;
  }

  /** MRP is shown struck through only when it is above the selling price. */
  get showMrp(): boolean {
    const v = this.selectedVariant;
    return !!v && v.mrpPaise > v.pricePaise;
  }

  getStars(rating: number): number[] {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(1);
    }
    
    if (hasHalfStar) {
      stars.push(0.5);
    }
    
    const remainingStars = 5 - stars.length;
    for (let i = 0; i < remainingStars; i++) {
      stars.push(0);
    }
    
    return stars;
  }

  navigateToProduct(productId: string) {
    this.router.navigate(['/product', productId]);
  }

  navigateToCategory(category: string) {
    this.router.navigate(['/category', category]);
  }

  addToCart(then?: () => void): void {
    const variant = this.selectedVariant;
    if (!this.product || !variant || !this.isInStock) return;
    this.quantity = clampQty(this.quantity, this.limits);
    this.stockLoading = true;
    this.cart.add(this.product.id, variant.id, this.quantity).subscribe({
      next: () => {
        this.stockLoading = false;
        this.isAddedToCart = true;
        setTimeout(() => (this.isAddedToCart = false), 3000);
        then?.();
      },
      error: err => {
        this.stockLoading = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not add to cart'), ToastType.Error);
      }
    });
  }

  buyNow(event: Event): void {
    event.preventDefault();
    this.addToCart(() => this.router.navigate(['/checkout']));
  }

  notifyMe(event: Event): void {
    event.preventDefault();
    const variant = this.selectedVariant;
    if (!variant || this.notifyRequested) return;
    let phone = this.session.user()?.phone;
    if (!phone) {
      const entered = (window.prompt('Enter your mobile number and we will let you know when this is back in stock') || '').replace(/\D/g, '');
      if (!entered) return;
      if (entered.length < 10) {
        this.toaster.showToast('Please enter a valid 10-digit mobile number', ToastType.Warn);
        return;
      }
      phone = entered.slice(-10);
    }
    this.api.notifyMe({ variantId: variant.id, phone }).subscribe({
      next: () => {
        this.notifyRequested = true;
        this.toaster.showToast('We will notify you when it is back in stock', ToastType.Success);
      },
      error: err => this.toaster.showToast(apiErrorMessage(err), ToastType.Error)
    });
  }

  updateQuantity(change: number): void {
    this.quantity = clampQty(this.quantity + change, this.limits);
  }

  toggleProductInfo(sectionId: string) {
    const productInfoContents = document.querySelectorAll('.product-info-content');
    const targetSection = document.getElementById('product-info-' + sectionId);
    
    // Hide all sections
    productInfoContents.forEach((content: any) => {
      content.style.display = 'none';
    });
    
    // Show the selected section if it exists
    if (targetSection) {
      if (targetSection.style.display === 'block') {
        targetSection.style.display = 'none';
      } else {
        targetSection.style.display = 'block';
      }
    }
  }

  getStockStatusText(): string {
    if (this.stockLoading) return 'Adding to cart...';
    return this.isInStock ? 'In Stock' : 'Out of Stock';
  }

  getStockStatusClass(): string {
    if (this.stockLoading) return 'stock-loading';
    return this.isInStock ? 'stock-available' : 'stock-unavailable';
  }

  getAddToCartButtonText(): string {
    if (this.stockLoading) return 'Adding...';
    if (this.isAddedToCart) return 'Added to Cart';
    if (!this.selectedVariant || !this.isInStock) return 'Out of Stock';
    return 'Add to Cart';
  }

  private initializeProductFunctionality() {
    // Read more functionality
    const readMoreBtn = document.getElementById('read-more-btn');
    const moreDescription = document.getElementById('more-description');
    
    if (readMoreBtn && moreDescription) {
      readMoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        if (moreDescription.style.display === 'none') {
          moreDescription.style.display = 'block';
          readMoreBtn.textContent = 'Read less';
        } else {
          moreDescription.style.display = 'none';
          readMoreBtn.textContent = 'Read more';
        }
      });
    }

    // Thumbnail functionality
    const thumbnails = document.querySelectorAll('.thumbnail');
    const mainImage = document.getElementById('mainProductImage') as HTMLImageElement;
    
    thumbnails.forEach(thumbnail => {
      thumbnail.addEventListener('click', () => {
        // Update active thumbnail
        thumbnails.forEach(thumb => thumb.classList.remove('active'));
        thumbnail.classList.add('active');
        
        // Update main image
        const imageSrc = thumbnail.getAttribute('data-src');
        if (imageSrc && mainImage) {
          mainImage.src = imageSrc;
        }
      });
    });
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function toRelated(card: ProductCard): RelatedView {
  return {
    id: card.slug,
    name: card.name,
    image: card.thumbnail,
    badge: card.badge,
    description: card.shortDescription,
    rating: Math.round((card.rating?.average ?? 0) * 10) / 10,
    categoryIds: card.categoryIds ?? []
  };
}
