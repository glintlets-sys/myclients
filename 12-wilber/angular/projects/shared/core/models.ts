// Types for the Glint Commerce API (see glint-commerce-backend/docs/API.md). All money values are paise.

export interface VariantCard {
  id: string;
  name: string;
  pricePaise: number;
  mrpPaise: number;
  inStock: boolean;
  /** Effective order quantity limits (published catalog). */
  minQty?: number;
  maxQty?: number;
  priceSlabs?: PriceSlab[];
}

/** "Buy minQty or more at unitPricePaise each". */
export interface PriceSlab {
  minQty: number;
  unitPricePaise: number;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  code?: string;
  categoryIds: string[];
  thumbnail?: string;
  /** Published on every card (PublishService.card). */
  brand?: string;
  badge?: string;
  shortDescription?: string;
  featured?: boolean;
  sortOrder?: number;
  tags?: string[];
  rating?: { average: number; count: number };
  minPricePaise: number;
  inStock: boolean;
  variants: VariantCard[];
}

export interface Variant {
  id: string;
  sku?: string;
  name: string;
  attributes?: Record<string, string>;
  pricePaise: number;
  mrpPaise: number;
  weightKg?: number;
  images?: string[];
  active: boolean;
  inStock?: boolean;
  /** Admin responses only. */
  stock?: number;
  priceSlabs?: PriceSlab[];
  /** Per-variant overrides of the product's limits (null = use the product's). */
  minOrderQty?: number | null;
  maxOrderQty?: number | null;
  /** Effective limits, filled in the published catalog. */
  minQty?: number;
  maxQty?: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  code?: string;
  categoryIds: string[];
  brand?: string;
  hsn?: string;
  taxRatePercent?: number | null;
  shortDescription?: string;
  description?: string;
  specs: { label: string; value: string }[];
  features: string[];
  applications: string[];
  considerations: string[];
  howToApply: string[];
  packagingType?: string;
  badge?: string;
  images: string[];
  thumbnail?: string;
  applicationImage?: string;
  videoUrl?: string;
  documents?: { label: string; url: string }[];
  tags: string[];
  active: boolean;
  featured?: boolean;
  sortOrder?: number;
  stockManaged?: boolean;
  hideWhenOutOfStock?: boolean;
  minOrderQty?: number | null;
  maxOrderQty?: number | null;
  relatedProductIds?: string[];
  boughtTogetherIds?: string[];
  variants: Variant[];
  rating?: { average: number; count: number };
  seoTitle?: string;
  seoDescription?: string;
  related?: ProductCard[];
  boughtTogetherProducts?: ProductCard[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string;
  image?: string;
  bannerImage?: string;
  parentId?: string;
  sortOrder?: number;
  active?: boolean;
  productCount?: number;
  seoTitle?: string;
  seoDescription?: string;
  updatedAt?: string;
}

export interface Blog {
  slug: string;
  title: string;
  excerpt?: string;
  content?: string;
  image?: string;
  author?: string;
  category?: string;
  tags?: string[];
  readTime?: string;
  externalUrl?: string;
  publishDate?: string;
  published?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicConfig {
  tenantId: string;
  store: {
    name?: string; supportEmail?: string; supportPhone?: string; whatsapp?: string;
    address?: string; logoUrl?: string; currency?: string; gstin?: string;
  };
  tax: { pricesIncludeTax: boolean; defaultRatePercent: number };
  shipping: { flatFeePaise: number; freeAbovePaise: number };
  paymentMethods: {
    phonepe?: { mode: string };
    razorpay?: { mode: string; keyId: string };
    ccavenue?: { mode: string };
    cod?: { maxOrderPaise: number; feePaise: number };
  };
  features: { blogs: boolean; reviews: boolean; wishlist: boolean; notifyMe: boolean; guestCheckout: boolean; hideOutOfStock?: boolean };
  /** Public web-analytics tags set by the store owner in admin → Settings; the storefront injects them. */
  analytics?: { googleMeasurementId?: string; facebookPixelId?: string };
  /** Inputs of the SEO rules (the same ones the pre-rendered pages use). */
  seo?: PublicSeoConfig;
  catalog?: CatalogPointer;
}

export interface PublicSeoConfig {
  enabled: boolean;
  /** Canonical origin, e.g. https://wilber.cloudshops.app (no trailing slash). */
  siteUrl?: string;
  legalName?: string;
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

/** What a publish wrote for search engines (part of the publish record). */
export interface SeoPublishSummary {
  enabled?: boolean;
  pages?: number;
  written?: number;
  removed?: number;
  shell?: 'storefront' | 'fallback';
  issues?: number;
  sitemapUrl?: string;
  robotsUrl?: string;
  error?: string;
}

export interface CatalogPointer {
  tenantId?: string;
  version?: string;
  publishedAt?: string;
  base?: string;
  productCount?: number;
  seo?: SeoPublishSummary;
  /** URL of banners.json (live marketing banners at publish time) and how many it holds. */
  banners?: string;
  bannerCount?: number;
}

/** A live banner as published in banners.json (admin → Marketing → Banners). */
export interface PublishedBanner {
  id: string;
  title: string;
  subtitle?: string;
  /** home-hero | home-strip | category-top */
  placement: string;
  categoryId?: string | null;
  categorySlug?: string;
  imageDesktop: string;
  imageMobile?: string | null;
  altText?: string;
  linkType: 'none' | 'product' | 'category' | 'url';
  linkTarget?: string | null;
  /** Slug of the linked product/category (set for product and category links). */
  linkSlug?: string;
  ctaLabel?: string;
  sortOrder?: number;
}

export interface SeoIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  kind: 'product' | 'category' | 'blog' | 'page' | 'site';
  id?: string;
  path?: string;
  name: string;
  message: string;
}

/** GET /v1/admin/seo/report */
export interface SeoReport {
  tenantId?: string;
  generatedAt?: string;
  version?: string;
  enabled?: boolean;
  siteUrl?: string;
  shell?: 'storefront' | 'fallback';
  pages?: number;
  written?: number;
  removed?: number;
  sitemapUrl?: string;
  robotsUrl?: string;
  cdnSitemapUrl?: string;
  cdnRobotsUrl?: string;
  counts?: Partial<Record<'error' | 'warning' | 'info', number>>;
  issueCount?: number;
  issues?: SeoIssue[];
  truncated?: boolean;
}

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STORE_MANAGER' | 'FINANCE_MANAGER' | 'ACCOUNTS' | 'CUSTOMER';

export interface User {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  role: Role;
  permissions: string[];
  status: string;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface Session {
  token: string;
  expiresAt: number;
  user: User;
}

export interface Address {
  id?: string;
  name: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  isDefault?: boolean;
  /** Optional buyer GSTIN, printed on the tax invoice. */
  gstin?: string;
}

export interface CartLine {
  productId: string;
  variantId: string;
  qty: number;
}

export interface QuoteLine {
  productId: string;
  variantId: string;
  slug?: string;
  name: string;
  variantName?: string;
  sku?: string;
  hsn?: string;
  image?: string;
  /** Price charged per unit (the slab price when appliedSlab is set). */
  unitPricePaise: number;
  basePricePaise?: number;
  appliedSlab?: PriceSlab | null;
  nextSlab?: PriceSlab | null;
  slabSavingsPaise?: number;
  minQty?: number;
  maxQty?: number;
  mrpPaise: number;
  qty: number;
  lineTotalPaise: number;
  taxRatePercent: number;
  taxPaise: number;
  available: boolean;
  stockAvailable?: number | null;
}

export interface PaymentOption {
  id: 'phonepe' | 'razorpay' | 'ccavenue' | 'cod';
  available: boolean;
  reason?: string;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalPaise: number;
  slabSavingsPaise?: number;
  discountPaise: number;
  couponCode?: string;
  couponMessage?: string;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  pricesIncludeTax: boolean;
  totalPaise: number;
  paymentMethods: PaymentOption[];
  issues: string[];
  canCheckout: boolean;
}

export type OrderStatus = 'PENDING_PAYMENT' | 'PLACED' | 'CONFIRMED' | 'READY_TO_DISPATCH' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'COD_PENDING' | 'COD_PARTIAL' | 'COD_COLLECTED' | 'REFUND_PENDING' | 'REFUNDED';

export interface Shipment {
  provider?: string;
  providerOrderId?: string;
  shipmentId?: string;
  awb?: string;
  courier?: string;
  trackingUrl?: string;
  shippedAt?: string;
  deliveredAt?: string;
}

export interface Order {
  id: string;
  userId: string;
  customer: { name?: string; phone?: string; email?: string };
  shippingAddress: Address;
  lines: QuoteLine[];
  subtotalPaise: number;
  discountPaise: number;
  couponCode?: string;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  pricesIncludeTax: boolean;
  totalPaise: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  payment?: { provider?: string; attempts?: number; paidAt?: string; mode?: string; reference?: string };
  shipment?: Shipment;
  notes?: string;
  history: { at: string; status: string; note?: string; by?: string }[];
  /** WEB (storefront), ADMIN (placed by staff) or QUOTE (accepted quotation). */
  channel?: 'WEB' | 'ADMIN' | 'QUOTE';
  placedBy?: string;
  quoteId?: string;
  quoteNumber?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  codCollectedPaise?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface PaymentAction {
  type: 'redirect' | 'form_post' | 'razorpay_checkout' | 'none' | 'error';
  url?: string;
  fields?: Record<string, string>;
  data?: any;
  message?: string;
}

export interface PageResult<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface Coupon {
  code: string;
  description?: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  minOrderPaise?: number;
  maxDiscountPaise?: number;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
  perUserLimit?: number;
  usedCount?: number;
  active: boolean;
}

export interface ApiError {
  error: string;
  message: string;
}

/** Human-readable labels used across customer and admin screens. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  READY_TO_DISPATCH: 'Ready to dispatch',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  COD_PENDING: 'Cash on delivery',
  COD_PARTIAL: 'COD part-collected',
  COD_COLLECTED: 'COD collected',
  REFUND_PENDING: 'Refund pending',
  REFUNDED: 'Refunded',
};
