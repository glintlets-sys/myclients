import { Component, EventEmitter, Input, OnInit, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { AdminApi } from '../../core/admin-api';
import { AdminCatalogApi } from '../../core/admin-catalog-api';
import { Category, Product, Variant } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { SeoFieldsComponent, slugPreview } from '../admin-seo/seo-fields.component';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

/** Variant row in the editor: money in rupees (as typed), stock as an editable number. */
interface VariantForm {
  id?: string;
  name: string;
  sku: string;
  price: number | null;
  mrp: number | null;
  weightKg: number | null;
  active: boolean;
  attributes?: Record<string, string>;
  images?: string[];
  stock: number | null;
  originalStock: number | null;
  /** Quantity slabs in rupees, as typed: "buy minQty+ at unitPrice each". */
  slabs: { minQty: number | null; unitPrice: number | null }[];
  /** Per-variant overrides of the product's min/max order quantity (empty = use the product's). */
  minOrderQty: number | null;
  maxOrderQty: number | null;
  /** Editor UI: slab/limit row expanded. */
  showRules?: boolean;
}

/** Product editor model. List-like fields are edited as one item per line. */
interface ProductForm {
  id?: string;
  name: string;
  slug: string;
  code: string;
  brand: string;
  categoryIds: string[];
  shortDescription: string;
  description: string;
  badge: string;
  tags: string;
  hsn: string;
  taxRatePercent: number | null;
  packagingType: string;
  videoUrl: string;
  applicationImage: string;
  images: string[];
  specs: string;
  features: string;
  applications: string;
  considerations: string;
  howToApply: string;
  seoTitle: string;
  seoDescription: string;
  active: boolean;
  featured: boolean;
  sortOrder: number;
  stockManaged: boolean;
  hideWhenOutOfStock: boolean;
  minOrderQty: number | null;
  maxOrderQty: number | null;
  variants: VariantForm[];
}

const toPaise = (rupees: number | null | undefined) => Math.round((Number(rupees) || 0) * 100);
const toRupees = (paise: number | null | undefined) => (paise ?? 0) / 100;
const lines = (text: string) => (text ?? '').split('\n').map(s => s.trim()).filter(Boolean);
/** Empty input / 0 → null (no limit), otherwise a whole number. */
const optInt = (n: number | string | null | undefined) =>
  (n === null || n === undefined || n === '' || !Number(n) ? null : Math.floor(Number(n)));
const newVariant = (): VariantForm => ({
  name: '', sku: '', price: null, mrp: null, weightKg: null, active: true, stock: 0, originalStock: null,
  slabs: [], minOrderQty: null, maxOrderQty: null
});

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe, SeoFieldsComponent],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.scss'
})
export class AdminProductsComponent implements OnInit, OnDestroy {
  readonly slugPreview = slugPreview;
  /** New products are added from a category (Categories → "Add product"): opens the editor with that category ticked. */
  @Input() addToCategory: string | null = null;
  /** "Add Product" on this page sends the user to Categories to pick the category first. */
  @Output() gotoCategories = new EventEmitter<void>();
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);
  private readonly catalogApi = inject(AdminCatalogApi);

  /** Store-wide "hide out-of-stock products" (overrides each product's own setting). */
  hideOutOfStock = false;
  savingHideOutOfStock = false;
  /** Hidden for Wilber (Shoba, 14 Nov 2026): the "Hide out-of-stock products" box and the Import/Export guide.
   *  The store setting itself is unchanged (stays as saved). Flip to true to show them again. */
  readonly showHideOutOfStock = false;
  readonly showGuide = false;

  products: Product[] = [];
  categories: Category[] = [];
  /** Pack sizes switched off on otherwise live products (e.g. imported without a confirmed price). */
  hiddenVariants: { productId: string; productName: string; variantId: string; variantName: string; pricePaise: number }[] = [];
  showHiddenList = false;
  /** Variant to highlight when the editor is opened from the hidden-pack-sizes list. */
  highlightVariantId: string | null = null;

  // Search and filter (server side)
  searchTerm = '';
  selectedCategory = '';
  /** '' = all, 'out' = a live pack size at zero, 'low' = below 10 */
  stockFilter = '';

  // Update Stock (select products, then set new totals per pack size)
  readonly selected = new Map<string, Product>();
  showStockModal = false;
  savingStock = false;
  stockRows: { productId: string; productName: string; variantId: string; variantName: string; current: number; target: number | null; active: boolean }[] = [];
  private readonly search$ = new Subject<void>();

  // Pagination: `page` is 1-based in the UI, the API is 0-based.
  tableSize = 10;
  page = 1;
  count = 0;

  isLoading = false;
  isExporting = false;
  isImporting = false;
  private subscriptions: Subscription[] = [];

  // Editor
  showEditor = false;
  editorLoading = false;
  saving = false;
  uploadingImages = false;
  editorError = '';
  form: ProductForm = this.emptyForm();
  /** Full product as loaded, so fields the editor does not show are preserved on save. */
  private original: Product | null = null;

  get Math() {
    return Math;
  }

  ngOnInit(): void {
    this.subscriptions.push(this.search$.pipe(debounceTime(300)).subscribe(() => {
      this.page = 1;
      this.loadBackendProducts();
    }));
    this.api.admin.categories().subscribe({
      next: res => this.categories = [...res.categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      error: () => this.categories = []
    });
    this.loadBackendProducts();
    this.loadHiddenVariants();
    if (this.addToCategory) this.addNewProduct(this.addToCategory);
    this.catalogApi.catalogSettings().subscribe({ next: s => this.hideOutOfStock = !!s.hideOutOfStock, error: () => {} });
  }

  toggleHideOutOfStock(event: Event): void {
    const input = event.target as HTMLInputElement;
    const next = input.checked;
    this.savingHideOutOfStock = true;
    this.catalogApi.saveCatalogSettings({ hideOutOfStock: next }).subscribe({
      next: s => {
        this.hideOutOfStock = !!s.hideOutOfStock;
        this.savingHideOutOfStock = false;
        this.toaster.showToast(next ? 'Out-of-stock products are now hidden from the store'
          : 'Out-of-stock products are shown in the store again', ToastType.Success, 3500);
      },
      error: err => {
        input.checked = this.hideOutOfStock;
        this.savingHideOutOfStock = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not change the setting'), ToastType.Error, 4000);
      }
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // ---------- list ----------

  loadBackendProducts(): void {
    this.isLoading = true;
    this.api.admin.products({
      q: this.searchTerm.trim(),
      category: this.selectedCategory,
      stock: this.stockFilter,
      page: this.page - 1,
      size: this.tableSize
    }).subscribe({
      next: res => {
        this.products = res.items;
        this.count = res.total;
        this.isLoading = false;
        if (this.products.length === 0 && this.page > 1 && this.count > 0) this.onTableDataChange(this.getTotalPages());
      },
      error: err => {
        this.isLoading = false;
        this.toaster.showToast(apiErrorMessage(err, 'Error loading products'), ToastType.Error, 4000);
      }
    });
  }

  applyFilters(): void {
    this.search$.next();
  }

  onCategoryChange(): void {
    this.page = 1;
    this.loadBackendProducts();
  }

  onTableDataChange(page: number): void {
    if (page < 1 || page > Math.max(1, this.getTotalPages())) return;
    this.page = page;
    this.loadBackendProducts();
  }

  onTableSizeChange(event: Event): void {
    this.tableSize = Number((event.target as HTMLSelectElement).value) || 10;
    this.page = 1;
    this.loadBackendProducts();
  }

  getTotalPages(): number {
    return Math.ceil(this.count / this.tableSize);
  }

  getPageNumbers(): number[] {
    const total = this.getTotalPages();
    const pages: number[] = [];
    for (let i = Math.max(1, this.page - 2); i <= Math.min(total, this.page + 2); i++) pages.push(i);
    return pages;
  }

  refreshData(): void {
    this.loadBackendProducts();
    this.loadHiddenVariants();
  }

  loadHiddenVariants(): void {
    this.api.admin.exportProducts().subscribe({
      next: res => this.hiddenVariants = res.rows
        .filter(r => r.productActive !== false && r.variantActive === false)
        .map(r => ({ productId: r.productId, productName: r.productName, variantId: r.variantId, variantName: r.variantName, pricePaise: r.pricePaise })),
      error: () => this.hiddenVariants = []
    });
  }

  // ---------- update stock ----------

  isSelected(product: Product): boolean {
    return this.selected.has(product.id);
  }

  toggleSelected(product: Product): void {
    if (this.selected.has(product.id)) this.selected.delete(product.id);
    else this.selected.set(product.id, product);
  }

  allOnPageSelected(): boolean {
    return this.products.length > 0 && this.products.every(p => this.selected.has(p.id));
  }

  toggleSelectPage(): void {
    const select = !this.allOnPageSelected();
    for (const p of this.products) {
      if (select) this.selected.set(p.id, p);
      else this.selected.delete(p.id);
    }
  }

  async openStockModal(): Promise<void> {
    if (!this.selected.size) return;
    this.showStockModal = true;
    this.savingStock = true;
    this.stockRows = [];
    try {
      // Fresh quantities, so the "current" column is what the server has right now.
      const rows = (await firstValueFrom(this.api.admin.exportProducts())).rows.filter(r => this.selected.has(r.productId));
      this.stockRows = rows.map(r => ({
        productId: r.productId, productName: r.productName, variantId: r.variantId, variantName: r.variantName,
        current: r.qty ?? 0, target: r.qty ?? 0, active: r.variantActive !== false
      }));
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Could not load stock'), ToastType.Error, 4000);
      this.showStockModal = false;
    } finally {
      this.savingStock = false;
    }
  }

  stockChange(row: { current: number; target: number | null }): number {
    return row.target === null || row.target === undefined ? 0 : Math.floor(Number(row.target)) - row.current;
  }

  changedStockRows() {
    return this.stockRows.filter(r => r.target !== null && Number(r.target) >= 0 && this.stockChange(r) !== 0);
  }

  async saveStockModal(): Promise<void> {
    const changes = this.changedStockRows();
    if (!changes.length) return;
    this.savingStock = true;
    const conflicts: string[] = [];
    let failed = 0;
    for (const r of changes) {
      try {
        await firstValueFrom(this.api.admin.setStock(r.variantId,
          { qty: Math.floor(Number(r.target)), expectedQty: r.current, productId: r.productId }));
      } catch (err: any) {
        if (err?.status === 409) conflicts.push(`${r.productName} (${r.variantName})`);
        else failed++;
      }
    }
    this.savingStock = false;
    if (conflicts.length) {
      this.toaster.showToast(`Stock changed while you were editing (an order came in) for: ${conflicts.join(', ')}. ` +
        'The latest numbers are loaded; please check and save again.', ToastType.Warn, 8000);
      await this.openStockModal();
    } else {
      this.toaster.showToast(failed ? `Stock updated with ${failed} error(s)` : `Stock updated for ${changes.length} pack size(s)`,
        failed ? ToastType.Warn : ToastType.Success, 4000);
      this.showStockModal = false;
      this.selected.clear();
    }
    this.loadBackendProducts();
  }

  closeStockModal(): void {
    if (!this.savingStock) this.showStockModal = false;
  }

  hasHiddenVariant(): boolean {
    return this.form.variants.some(v => !v.active);
  }

  editHiddenVariant(h:{ productId: string; variantId: string }): void {
    this.editProduct({ id: h.productId } as Product);
    this.highlightVariantId = h.variantId;
  }

  getProductName(product: Product): string {
    return product.name || 'Unnamed Product';
  }

  getProductDescription(product: Product): string {
    return product.shortDescription || '';
  }

  getProductThumbnail(product: Product): string {
    return product.thumbnail || product.images?.[0] || 'assets/images/image_empty.jpg';
  }

  minPrice(product: Product): number {
    const prices = (product.variants ?? []).map(v => v.pricePaise).filter(p => p > 0);
    return prices.length ? Math.min(...prices) : 0;
  }

  totalStock(product: Product): number {
    return (product.variants ?? []).reduce((sum, v) => sum + (v.stock ?? 0), 0);
  }

  categoryNames(product: Product): string {
    return (product.categoryIds ?? []).map(id => this.categories.find(c => c.id === id)?.name).filter(Boolean).join(', ');
  }

  getProductStatus(product: Product): string {
    return product.active ? 'Active' : 'Inactive';
  }

  getStatusClass(status: string): string {
    return status?.toLowerCase() === 'active' ? 'badge bg-success' : 'badge bg-secondary';
  }

  stockClass(qty: number | undefined, product: Product): string {
    if (product.stockManaged === false) return 'text-muted';
    if (!qty) return 'text-danger';
    if (qty < 10) return 'text-warning';
    return 'text-success';
  }

  detailProduct: Product | null = null;

  viewProductDetails(product: Product): void {
    this.detailProduct = product;
  }

  closeProductDetails(): void {
    this.detailProduct = null;
  }

  toggleProductAvailability(product: Product, event?: Event): void {
    const next = !product.active;
    if (!confirm(`Make "${product.name}" ${next ? 'active' : 'inactive'}?`)) {
      if (event) (event.target as HTMLInputElement).checked = product.active;
      return;
    }
    product.active = next;
    this.api.admin.setProductActive(product.id, next).subscribe({
      next: saved => {
        Object.assign(product, saved);
        this.toaster.showToast(`Product marked as ${next ? 'active' : 'inactive'}`, ToastType.Success, 3000);
      },
      error: err => {
        product.active = !next;
        this.toaster.showToast(apiErrorMessage(err, 'Error updating product status'), ToastType.Error, 4000);
      }
    });
  }

  deleteProduct(product: Product): void {
    if (!confirm(`Delete "${product.name}" permanently? Its stock records are removed too.`)) return;
    this.api.admin.deleteProduct(product.id).subscribe({
      next: () => {
        this.toaster.showToast('Product deleted', ToastType.Success, 3000);
        this.loadBackendProducts();
      },
      error: err => this.toaster.showToast(apiErrorMessage(err, 'Error deleting product'), ToastType.Error, 4000)
    });
  }

  // ---------- editor ----------

  addNewProduct(categoryId?: string): void {
    this.original = null;
    this.form = this.emptyForm();
    if (categoryId) this.form.categoryIds = [categoryId];
    this.editorError = '';
    this.showEditor = true;
  }

  editProduct(product: Product): void {
    this.highlightVariantId = null;
    this.editorError = '';
    this.editorLoading = true;
    this.showEditor = true;
    this.api.admin.product(product.id).subscribe({
      next: full => {
        this.original = full;
        this.form = this.toForm(full);
        this.editorLoading = false;
      },
      error: err => {
        this.editorLoading = false;
        this.editorError = apiErrorMessage(err, 'Could not load the product');
      }
    });
  }

  closeEditor(): void {
    if (this.saving) return;
    this.showEditor = false;
    this.original = null;
  }

  addVariant(): void {
    this.form.variants.push(newVariant());
  }

  addSlab(v: VariantForm): void {
    const last = v.slabs[v.slabs.length - 1];
    v.slabs.push({ minQty: last?.minQty ? last.minQty + 5 : 5, unitPrice: null });
    v.showRules = true;
  }

  removeSlab(v: VariantForm, index: number): void {
    v.slabs.splice(index, 1);
  }

  /** Percentage off the selling price for a slab row (display only). */
  slabDiscountPct(v: VariantForm, s: { unitPrice: number | null }): number | null {
    if (!v.price || !s.unitPrice) return null;
    return Math.round(((v.price - s.unitPrice) / v.price) * 100);
  }

  /** Short label for the variant's bulk-price / quantity-limit settings, e.g. "2 slabs, qty 5–50". */
  rulesSummary(v: VariantForm): string {
    const parts: string[] = [];
    if (v.slabs.length) parts.push(v.slabs.length + (v.slabs.length > 1 ? ' slabs' : ' slab'));
    if (v.minOrderQty || v.maxOrderQty) parts.push('qty ' + (v.minOrderQty ?? 1) + '–' + (v.maxOrderQty ?? 'any'));
    return parts.join(', ');
  }

  removeVariant(index: number): void {
    if (this.form.variants.length <= 1) return;
    this.form.variants.splice(index, 1);
  }

  isCategorySelected(id: string): boolean {
    return this.form.categoryIds.includes(id);
  }

  toggleCategory(id: string): void {
    const ids = this.form.categoryIds;
    this.form.categoryIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  }

  async onImagesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    this.uploadingImages = true;
    this.editorError = '';
    try {
      for (const file of files) this.form.images.push(await this.api.upload(file));
    } catch (err) {
      this.editorError = apiErrorMessage(err, 'Image upload failed');
    } finally {
      this.uploadingImages = false;
      input.value = '';
    }
  }

  async onApplicationImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingImages = true;
    try {
      this.form.applicationImage = await this.api.upload(file);
    } catch (err) {
      this.editorError = apiErrorMessage(err, 'Image upload failed');
    } finally {
      this.uploadingImages = false;
      input.value = '';
    }
  }

  removeImage(index: number): void {
    this.form.images.splice(index, 1);
  }

  makePrimaryImage(index: number): void {
    const [img] = this.form.images.splice(index, 1);
    this.form.images.unshift(img);
  }

  async saveProduct(): Promise<void> {
    this.editorError = this.validate();
    if (this.editorError) return;
    this.saving = true;
    const body = this.fromForm();
    try {
      const saved = this.form.id
        ? await firstValueFrom(this.api.admin.updateProduct(this.form.id, body))
        : await firstValueFrom(this.api.admin.createProduct(body));
      await this.saveStock(saved);
      this.saving = false;
      this.toaster.showToast(this.form.id ? 'Product updated' : 'Product created', ToastType.Success, 3000);
      this.showEditor = false;
      this.original = null;
      this.loadBackendProducts();
      this.loadHiddenVariants();
    } catch (err) {
      this.saving = false;
      this.editorError = apiErrorMessage(err, 'Could not save the product');
    }
  }

  /** Stock is stored separately from the product: set every variant whose quantity was changed. */
  private async saveStock(saved: Product): Promise<void> {
    const failures: string[] = [];
    for (let i = 0; i < this.form.variants.length; i++) {
      const v = this.form.variants[i];
      const target = saved.variants[i];
      if (!target || v.stock === null || v.stock === undefined || v.stock === v.originalStock) continue;
      if (v.originalStock === null && !v.stock) continue;
      try {
        await firstValueFrom(this.api.admin.setStock(target.id, {
          qty: Math.max(0, Math.floor(Number(v.stock))), productId: saved.id, expectedQty: v.originalStock ?? undefined
        }));
      } catch {
        failures.push(target.name);
      }
    }
    if (failures.length) {
      this.toaster.showToast(`Saved, but stock could not be updated for: ${failures.join(', ')}`, ToastType.Warn, 6000);
    }
  }

  private validate(): string {
    const f = this.form;
    if (!f.name.trim()) return 'Product name is required';
    if (!f.variants.length) return 'Add at least one variant (size/price)';
    for (const v of f.variants) {
      const label = v.name || 'unnamed variant';
      if (!v.name.trim()) return 'Every variant needs a name (e.g. "20 KG")';
      if (!v.price || v.price <= 0) return `Variant "${label}" needs a selling price`;
      if (v.mrp && v.mrp < v.price) return `MRP of "${label}" must be at least the selling price`;
      const slabs = [...v.slabs].filter(s => s.minQty || s.unitPrice).sort((a, b) => (a.minQty ?? 0) - (b.minQty ?? 0));
      let previous = v.price;
      let previousQty = 1;
      for (const s of slabs) {
        if (!s.minQty || s.minQty < 2) return `"${label}": slab quantities start at 2 or more`;
        if (s.minQty === previousQty) return `"${label}": two slabs for ${s.minQty} units`;
        if (!s.unitPrice || s.unitPrice <= 0) return `"${label}": enter the price for ${s.minQty}+ units`;
        if (s.unitPrice >= v.price) return `"${label}": price for ${s.minQty}+ must be below the selling price`;
        if (s.unitPrice >= previous) return `"${label}": slab prices must go down as quantity goes up`;
        previous = s.unitPrice;
        previousQty = s.minQty;
      }
      const min = optInt(v.minOrderQty) ?? optInt(f.minOrderQty) ?? 1;
      const max = optInt(v.maxOrderQty) ?? optInt(f.maxOrderQty) ?? 99;
      if (min > 99 || max > 99) return `"${label}": quantity limits can be at most 99`;
      if (min > max) return `"${label}": minimum order quantity is above the maximum`;
      if (slabs.some(s => (s.minQty ?? 0) > max)) return `"${label}": a slab starts above the maximum order quantity`;
    }
    const skus = f.variants.map(v => v.sku.trim()).filter(Boolean);
    if (new Set(skus).size !== skus.length) return 'Variant SKUs must be unique';
    return '';
  }

  private emptyForm(): ProductForm {
    return {
      name: '', slug: '', code: '', brand: '', categoryIds: [], shortDescription: '', description: '', badge: '', tags: '',
      hsn: '', taxRatePercent: null, packagingType: '', videoUrl: '', applicationImage: '', images: [], specs: '', features: '',
      applications: '', considerations: '', howToApply: '', seoTitle: '', seoDescription: '', active: true, featured: false,
      sortOrder: 0, stockManaged: true, hideWhenOutOfStock: false, minOrderQty: null, maxOrderQty: null,
      variants: [{ ...newVariant(), name: 'Standard' }]
    };
  }

  private toForm(p: Product): ProductForm {
    return {
      id: p.id,
      name: p.name ?? '',
      slug: p.slug ?? '',
      code: p.code ?? '',
      brand: p.brand ?? '',
      categoryIds: [...(p.categoryIds ?? [])],
      shortDescription: p.shortDescription ?? '',
      description: p.description ?? '',
      badge: p.badge ?? '',
      tags: (p.tags ?? []).join(', '),
      hsn: p.hsn ?? '',
      taxRatePercent: p.taxRatePercent ?? null,
      packagingType: p.packagingType ?? '',
      videoUrl: p.videoUrl ?? '',
      applicationImage: p.applicationImage ?? '',
      images: [...(p.images ?? [])],
      specs: (p.specs ?? []).map(s => `${s.label}: ${s.value}`).join('\n'),
      features: (p.features ?? []).join('\n'),
      applications: (p.applications ?? []).join('\n'),
      considerations: (p.considerations ?? []).join('\n'),
      howToApply: (p.howToApply ?? []).join('\n'),
      seoTitle: p.seoTitle ?? '',
      seoDescription: p.seoDescription ?? '',
      active: p.active,
      featured: !!p.featured,
      sortOrder: p.sortOrder ?? 0,
      stockManaged: p.stockManaged !== false,
      hideWhenOutOfStock: !!p.hideWhenOutOfStock,
      minOrderQty: p.minOrderQty ?? null,
      maxOrderQty: p.maxOrderQty ?? null,
      variants: (p.variants ?? []).map(v => ({
        id: v.id,
        name: v.name ?? '',
        sku: v.sku ?? '',
        price: toRupees(v.pricePaise),
        mrp: v.mrpPaise ? toRupees(v.mrpPaise) : null,
        weightKg: v.weightKg ?? null,
        active: v.active !== false,
        attributes: v.attributes,
        images: v.images,
        stock: v.stock ?? 0,
        originalStock: v.stock ?? 0,
        slabs: (v.priceSlabs ?? []).map(s => ({ minQty: s.minQty, unitPrice: toRupees(s.unitPricePaise) })),
        minOrderQty: v.minOrderQty ?? null,
        maxOrderQty: v.maxOrderQty ?? null,
      }))
    };
  }

  private fromForm(): Partial<Product> {
    const f = this.form;
    const base: Partial<Product> = { ...(this.original ?? {}) };
    delete base.related;
    delete base.boughtTogetherProducts;
    delete base.rating;
    const opt = (s: string) => s.trim() || undefined;
    const thumbnailStillValid = base.thumbnail && f.images.includes(base.thumbnail) && f.images[0] === base.thumbnail;
    const variants: Variant[] = f.variants.map(v => ({
      id: v.id,
      name: v.name.trim(),
      sku: opt(v.sku),
      attributes: v.attributes,
      images: v.images ?? [],
      pricePaise: toPaise(v.price),
      mrpPaise: v.mrp ? toPaise(v.mrp) : 0,
      weightKg: v.weightKg ? Number(v.weightKg) : undefined,
      active: v.active,
      priceSlabs: v.slabs.filter(s => s.minQty && s.unitPrice)
        .map(s => ({ minQty: Math.floor(Number(s.minQty)), unitPricePaise: toPaise(s.unitPrice) }))
        .sort((a, b) => a.minQty - b.minQty),
      minOrderQty: optInt(v.minOrderQty),
      maxOrderQty: optInt(v.maxOrderQty),
    }));
    return {
      ...base,
      name: f.name.trim(),
      slug: opt(f.slug),
      code: opt(f.code),
      brand: opt(f.brand),
      categoryIds: f.categoryIds,
      shortDescription: opt(f.shortDescription),
      description: opt(f.description),
      badge: opt(f.badge),
      tags: f.tags.split(',').map(t => t.trim()).filter(Boolean),
      hsn: opt(f.hsn),
      taxRatePercent: f.taxRatePercent === null || (f.taxRatePercent as unknown) === '' ? null : Number(f.taxRatePercent),
      packagingType: opt(f.packagingType),
      videoUrl: opt(f.videoUrl),
      applicationImage: opt(f.applicationImage),
      images: f.images,
      thumbnail: thumbnailStillValid ? base.thumbnail : f.images[0],
      specs: lines(f.specs).map(l => {
        const i = l.indexOf(':');
        return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: l, value: '' };
      }),
      features: lines(f.features),
      applications: lines(f.applications),
      considerations: lines(f.considerations),
      howToApply: lines(f.howToApply),
      seoTitle: opt(f.seoTitle),
      seoDescription: opt(f.seoDescription),
      active: f.active,
      featured: f.featured,
      sortOrder: Number(f.sortOrder) || 0,
      stockManaged: f.stockManaged,
      hideWhenOutOfStock: f.hideWhenOutOfStock,
      minOrderQty: optInt(f.minOrderQty),
      maxOrderQty: optInt(f.maxOrderQty),
      variants,
    };
  }

  // ---------- Excel export / bulk update ----------

  exportProducts(): void {
    this.isExporting = true;
    this.api.admin.exportProducts().subscribe({
      next: res => {
        const sheetRows = res.rows.map(r => ({
          'Product ID': r.productId,
          'Variant ID': r.variantId,
          'Product': r.productName,
          'Code': r.code ?? '',
          'Variant': r.variantName ?? '',
          'SKU': r.sku ?? '',
          'Price (₹)': toRupees(r.pricePaise),
          'Stock': r.qty ?? 0,
          'Stock Managed': r.stockManaged ? 'Yes' : 'No',
          'Active': (r.variantActive ?? r.active) ? 'Yes' : 'No',
          'Categories': r.categories ?? '',
          'HSN': r.hsn ?? '',
          'Tax %': r.taxRatePercent ?? '',
        }));
        const ws = XLSX.utils.json_to_sheet(sheetRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Products');
        XLSX.writeFile(wb, `products_export_${new Date().toISOString().split('T')[0]}.xlsx`);
        this.isExporting = false;
        this.toaster.showToast(`Exported ${sheetRows.length} variants`, ToastType.Success, 3000);
      },
      error: err => {
        this.isExporting = false;
        this.toaster.showToast(apiErrorMessage(err, 'Error exporting products'), ToastType.Error, 4000);
      }
    });
  }

  /**
   * Bulk price/stock update from an edited export file: rows are matched by Variant ID (or SKU); changed
   * prices are saved on the product, changed stock is set per variant. New products are not created here.
   */
  importProducts(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' });
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
          this.runBulkUpdate(rows, file.name);
        } catch {
          this.toaster.showToast('Could not read the file. Use the exported Excel format.', ToastType.Error, 4000);
        }
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  }

  private async runBulkUpdate(rows: Record<string, any>[], fileName: string): Promise<void> {
    this.isImporting = true;
    try {
      const current = (await firstValueFrom(this.api.admin.exportProducts())).rows;
      const byVariant = new Map(current.map(r => [r.variantId, r]));
      const bySku = new Map(current.filter(r => r.sku).map(r => [String(r.sku).toLowerCase(), r]));
      // productId → variantId → changed fields
      const variantChanges = new Map<string, Map<string, { pricePaise?: number; active?: boolean }>>();
      const change = (productId: string, variantId: string) => {
        if (!variantChanges.has(productId)) variantChanges.set(productId, new Map());
        const byId = variantChanges.get(productId)!;
        if (!byId.has(variantId)) byId.set(variantId, {});
        return byId.get(variantId)!;
      };
      let priceCount = 0;
      let activeCount = 0;
      const stockChanges: { productId: string; variantId: string; qty: number; expectedQty: number }[] = [];
      let unmatched = 0;
      for (const row of rows) {
        const match = byVariant.get(String(row['Variant ID'] ?? '').trim())
          ?? bySku.get(String(row['SKU'] ?? '').trim().toLowerCase());
        if (!match) { unmatched++; continue; }
        const price = row['Price (₹)'];
        if (price !== '' && price !== undefined && !isNaN(Number(price))) {
          const paise = toPaise(Number(price));
          if (paise > 0 && paise !== match.pricePaise) {
            change(match.productId, match.variantId).pricePaise = paise;
            priceCount++;
          }
        }
        const activeCell = String(row['Active'] ?? '').trim().toLowerCase();
        if (activeCell && match.variantActive !== undefined) {
          const active = ['yes', 'y', 'true', '1'].includes(activeCell);
          if (active !== match.variantActive) {
            change(match.productId, match.variantId).active = active;
            activeCount++;
          }
        }
        const stock = row['Stock'];
        if (stock !== '' && stock !== undefined && !isNaN(Number(stock))) {
          const qty = Math.max(0, Math.floor(Number(stock)));
          if (qty !== match.qty) stockChanges.push({ productId: match.productId, variantId: match.variantId, qty, expectedQty: match.qty ?? 0 });
        }
      }
      if (!priceCount && !activeCount && !stockChanges.length) {
        this.isImporting = false;
        this.toaster.showToast(`No changes found in ${fileName}${unmatched ? ` (${unmatched} rows not matched)` : ''}`, ToastType.Info, 4000);
        return;
      }
      if (!confirm(`${fileName}:\n- ${priceCount} price change(s)\n- ${activeCount} pack size(s) switched on/off\n` +
        `  (${variantChanges.size} product(s) affected)\n- ${stockChanges.length} stock change(s)\n` +
        `${unmatched ? `- ${unmatched} row(s) not matched (skipped)\n` : ''}\nApply these changes?`)) {
        this.isImporting = false;
        return;
      }
      let failed = 0;
      for (const [productId, changes] of variantChanges) {
        try {
          const p = await firstValueFrom(this.api.admin.product(productId));
          const body: Partial<Product> = { ...p, variants: p.variants.map(v => ({ ...v, ...(changes.get(v.id) ?? {}) })) };
          delete body.related;
          delete body.boughtTogetherProducts;
          delete body.rating;
          await firstValueFrom(this.api.admin.updateProduct(productId, body));
        } catch {
          failed++;
        }
      }
      for (const s of stockChanges) {
        try {
          await firstValueFrom(this.api.admin.setStock(s.variantId, { qty: s.qty, productId: s.productId, expectedQty: s.expectedQty }));
        } catch {
          failed++;
        }
      }
      this.toaster.showToast(failed ? `Update finished with ${failed} error(s)` : 'Prices and stock updated',
        failed ? ToastType.Warn : ToastType.Success, 5000);
      this.loadBackendProducts();
      this.loadHiddenVariants();
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Bulk update failed'), ToastType.Error, 5000);
    } finally {
      this.isImporting = false;
    }
  }
}
