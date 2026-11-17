import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { combineLatest, map, switchMap } from 'rxjs';
import { HeaderComponent } from '../shared/header/header.component';
import { FooterComponent } from '../shared/footer/footer.component';
import { CatalogStoreService } from '../core/catalog-store.service';
import { CartStoreService } from '../core/cart-store.service';
import { SeoService, categoryPath, productPath } from '../core/seo.service';
import { categoryImage } from '../core/category-images';
import { categoryNames, searchProducts } from '../core/product-search';
import { Category as CatalogCategory, ProductCard, PublishedBanner, VariantCard } from '@shared/core/models';

const DEFAULT_PAGE_BANNER = 'assets/images/bnr3.jpg';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { apiErrorMessage } from '@shared/core/api.interceptor';

interface Category {
  id: string;
  name: string;
  link: string;
  active: boolean;
  count: number;
}

/** A sub-category tile on a parent category's page (e.g. Stone Solutions → Sealers). */
interface SubCategoryTile {
  name: string;
  link: string;
  image: string;
  count: number;
}

type SortKey = 'default' | 'name' | 'priceAsc' | 'priceDesc';

/** Card view model in the shape the (approved) template renders. */
interface CategoryProduct {
  id: string;
  name: string;
  link: string;
  image?: string;
  badge?: string;
  rating: number;
  description?: string;
  size: string[];
  card: ProductCard;
  /** Category names, shown on search results. */
  categoryNames?: string;
}

@Component({
  selector: 'app-category-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, HeaderComponent, FooterComponent],
  templateUrl: './category-detail.component.html',
  styleUrls: ['./category-detail.component.scss']
})
export class CategoryDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogStoreService);
  private readonly cart = inject(CartStoreService);
  private readonly toaster = inject(ToasterService);
  private readonly seo = inject(SeoService);

  /** Left pane: the current category and its siblings under the same parent. */
  categories: Category[] = [];
  products: CategoryProduct[] = [];
  currentCategory = '';
  currentCategoryName = '';
  currentDescription = '';
  /** Parent of the current category (e.g. Stone Solutions), shown in the breadcrumb and above the left pane. */
  parent?: { name: string; link: string };
  /** Set on a parent category's page: its sub-categories are shown as tiles instead of products. */
  subCategories: SubCategoryTile[] = [];
  /** A top-level category with no sub-categories and no products yet (e.g. Industrial Solutions). */
  comingSoon = false;
  sort: SortKey = 'default';
  notFound = false;
  loading = true;
  addedToCartItems: Set<string> = new Set();

  /** Page banner: the admin "Category page – top" banner for this category (or one without a category), else the default. */
  pageBanner = DEFAULT_PAGE_BANNER;
  private topBanners: PublishedBanner[] = [];

  /** Full-row search on the category page: finds similar products across ALL categories. */
  query = '';
  results: CategoryProduct[] = [];
  private allProducts: ProductCard[] = [];
  private allCategories: CatalogCategory[] = [];

  isInStock: { [productId: string]: boolean } = {};
  /** Pack size (variant) the customer picked on a card; defaults to the first in-stock one. */
  selectedVariantId: { [productId: string]: string } = {};
  stockLoading: { [productId: string]: boolean } = {};

  ngOnInit() {
    this.catalog.banners('category-top').subscribe(bs => { this.topBanners = bs; this.pickPageBanner(); });
    // ?q=… opens the page with a search already typed (shareable links; the header search points here).
    // Subscribed, not a snapshot: searching from the header while already on a category page changes only ?q=.
    this.route.queryParamMap.subscribe(qp => {
      const q = qp.get('q') ?? '';
      if (q === this.query) return;
      this.query = q;
      this.runSearch();
    });
    this.route.paramMap.pipe(
      map(params => params.get('slug') ?? params.get('category') ?? ''),
      switchMap(slug => {
        this.loading = true;
        return combineLatest([this.catalog.categories(), this.catalog.productsInCategory(slug), this.catalog.products()]).pipe(
          map(([categories, products, all]) => ({ slug, categories, products, all }))
        );
      })
    ).subscribe({
      next: ({ slug, categories, products, all }) => {
        this.allProducts = all;
        this.allCategories = categories;
        const current = categories.find(c => c.slug === slug || c.id === slug);
        if (current && current.slug !== slug) {
          // Old link with a category id: show the canonical /category/<slug> URL instead.
          this.router.navigate(['/category', current.slug], { replaceUrl: true });
          return;
        }
        this.notFound = !current;
        this.currentCategory = current?.slug ?? slug;
        this.currentCategoryName = current?.name ?? 'Products';
        this.currentDescription = current?.description ?? '';
        if (current) this.seo.category(current, categories, products);
        else this.seo.notFound('/category/' + encodeURIComponent(slug));

        const active = categories
          .filter(c => c.active !== false)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        const count = (c: CatalogCategory) => c.productCount ?? 0;
        const parent = current?.parentId ? active.find(c => c.id === current.parentId) : undefined;
        this.parent = parent ? { name: parent.name, link: categoryPath(parent) } : undefined;

        const children = current ? active.filter(c => c.parentId === current.id) : [];
        this.subCategories = children.map(c => ({ name: c.name, link: categoryPath(c), image: categoryImage(c), count: count(c) }));
        this.comingSoon = !!current && !current.parentId && !children.length && !products.length;

        // Left pane: the current category's siblings (same parent). Top-level categories only list other top-level ones.
        this.categories = active
          .filter(c => (c.parentId ?? '') === (current?.parentId ?? '') && !(!c.parentId && active.some(x => x.parentId === c.id)))
          .map(c => ({ id: c.slug, name: c.name, link: categoryPath(c), active: c.slug === this.currentCategory, count: count(c) }));

        this.products = products
          .slice()
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map(toView);
        this.applySort();
        this.isInStock = {};
        this.products.forEach(p => (this.isInStock[p.id] = p.card.inStock));
        this.runSearch();
        this.pickPageBanner();
        this.loading = false;
      },
      error: err => {
        console.error('Error loading products:', err);
        this.products = [];
        this.loading = false;
      }
    });
  }

  /** Search across ALL products (shared with the header search, see core/product-search.ts). Current category first. */
  runSearch() {
    if (!this.query.trim()) { this.results = []; return; }
    const hits = searchProducts(this.query, this.allProducts, this.allCategories);
    const catName = categoryNames(this.allCategories);
    const here = new Set(this.products.map(p => p.id));
    this.results = hits
      .sort((a, b) => (here.has(b.id) ? 1 : 0) - (here.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name))
      .map(card => ({ ...toView(card), categoryNames: card.categoryIds.map(id => catName.get(id)).filter(Boolean).join(', ') }));
    this.results.forEach(p => (this.isInStock[p.id] = p.card.inStock));
  }

  private pickPageBanner() {
    const mine = this.topBanners.find(b => b.categorySlug === this.currentCategory)
      ?? this.topBanners.find(b => !b.categoryId);
    this.pageBanner = mine?.imageDesktop || DEFAULT_PAGE_BANNER;
  }

  clearSearch() {
    this.query = '';
    this.results = [];
  }

  onSortChange(value: string) {
    this.sort = value as SortKey;
    this.applySort();
  }

  /** Lowest pack price in rupees, or undefined when the product has no priced pack. */
  fromPrice(product: CategoryProduct): number | undefined {
    const paise = product.card.minPricePaise;
    return paise > 0 ? paise / 100 : undefined;
  }

  private applySort() {
    const byOrder = (a: CategoryProduct, b: CategoryProduct) => (a.card.sortOrder ?? 0) - (b.card.sortOrder ?? 0);
    const price = (p: CategoryProduct) => p.card.minPricePaise > 0 ? p.card.minPricePaise : Number.MAX_SAFE_INTEGER;
    const cmp: Record<SortKey, (a: CategoryProduct, b: CategoryProduct) => number> = {
      default: byOrder,
      name: (a, b) => a.name.localeCompare(b.name),
      priceAsc: (a, b) => price(a) - price(b),
      priceDesc: (a, b) => (b.card.minPricePaise || 0) - (a.card.minPricePaise || 0)
    };
    this.products = this.products.slice().sort(cmp[this.sort]);
  }

  onCategoryClick(categoryId: string) {
    const category = this.categories.find(cat => cat.id === categoryId);
    if (category) {
      this.router.navigateByUrl(category.link);
    }
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

  /** The pack size shown as selected on a card — the one the customer picked, else the first in stock. */
  selectedVariant(product: CategoryProduct): VariantCard | undefined {
    const picked = product.card.variants.find(v => v.id === this.selectedVariantId[product.id]);
    return picked ?? product.card.variants.find(v => v.inStock) ?? product.card.variants[0];
  }

  selectVariant(product: CategoryProduct, v: VariantCard): void {
    if (v.inStock) this.selectedVariantId[product.id] = v.id;
  }

  addToCart(product: CategoryProduct) {
    const variant = this.selectedVariant(product);
    if (!variant || !variant.inStock) return;
    this.stockLoading[product.id] = true;
    // Start at the pack size's minimum order quantity (the API rejects less).
    this.cart.add(product.card.id, variant.id, Math.max(1, variant.minQty ?? 1)).subscribe({
      next: () => {
        this.stockLoading[product.id] = false;
        this.addedToCartItems.add(product.id);
        setTimeout(() => this.addedToCartItems.delete(product.id), 3000);
      },
      error: err => {
        this.stockLoading[product.id] = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not add to cart'), ToastType.Error);
      }
    });
  }

  getAddToCartButtonText(product: CategoryProduct): string {
    if (this.stockLoading[product.id]) {
      return 'Checking Stock...';
    }
    
    if (this.addedToCartItems.has(product.id)) {
      return 'Added to Cart';
    }
    
    if (!this.isInStock[product.id]) {
      return 'Out of Stock';
    }
    
    return 'Add To Cart';
  }

  getAddToCartButtonClass(product: CategoryProduct): string {
    if (this.stockLoading[product.id]) {
      return 'add-to-cart loading';
    }
    
    if (this.addedToCartItems.has(product.id)) {
      return 'add-to-cart added';
    }
    
    if (!this.isInStock[product.id]) {
      return 'add-to-cart disabled';
    }
    
    return 'add-to-cart';
  }

  isAddToCartDisabled(product: CategoryProduct): boolean {
    return this.stockLoading[product.id] || !this.isInStock[product.id] || this.addedToCartItems.has(product.id);
  }

  navigateToProduct(productId: string) {
    this.router.navigate(['/product', productId]);
  }
}

function toView(card: ProductCard): CategoryProduct {
  return {
    id: card.id,
    name: card.name,
    link: productPath(card),
    image: card.thumbnail,
    badge: card.badge,
    rating: Math.round((card.rating?.average ?? 0) * 10) / 10,
    description: card.shortDescription,
    size: card.variants.map(v => v.name),
    card
  };
}
