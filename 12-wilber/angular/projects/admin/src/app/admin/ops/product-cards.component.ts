import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminOpsApi, PickerProduct } from '../../core/admin-ops-api';
import { MoneyPipe } from '@shared/core/money.pipe';
import { Category } from '@shared/core/models';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/admin-api';
import { loadAllProducts } from '../admin-recommendations/recommendations';
import { PickedVariant } from './product-picker.component';

/** Storefront-style product grid: a card per product, a button per pack size (price + stock). Emits the chosen variant. */
@Component({
  selector: 'app-product-cards',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  template: `
  <div class="pc-search input-group mb-3">
    <span class="input-group-text bg-white"><i class="fas fa-search text-muted"></i></span>
    <input class="form-control" [(ngModel)]="q" (ngModelChange)="filter()" placeholder="Search product name, code or SKU">
    <button *ngIf="q" class="btn btn-outline-secondary" type="button" (click)="q = ''; filter()"><i class="fas fa-times"></i></button>
  </div>

  <div class="pc-cats" *ngIf="topCats.length">
    <button type="button" class="pc-cat" [class.on]="!catId" (click)="pickCat(null)">All <span>{{ all.length }}</span></button>
    <button *ngFor="let c of topCats" type="button" class="pc-cat" [class.on]="catId === c.id || parentOf(catId) === c.id"
            (click)="pickCat(c.id)">{{ c.name }} <span>{{ countIn(c.id) }}</span></button>
    <button *ngIf="uncategorised" type="button" class="pc-cat" [class.on]="catId === '_none'" (click)="pickCat('_none')">Other <span>{{ uncategorised }}</span></button>
  </div>
  <div class="pc-cats sub" *ngIf="subCats.length">
    <i class="fas fa-level-up-alt fa-rotate-90 text-muted me-1"></i>
    <button type="button" class="pc-cat" [class.on]="catId === subParent" (click)="pickCat(subParent)">All {{ nameOf(subParent) }}</button>
    <button *ngFor="let c of subCats" type="button" class="pc-cat" [class.on]="catId === c.id" (click)="pickCat(c.id)">{{ c.name }} <span>{{ countIn(c.id) }}</span></button>
  </div>

  <div *ngIf="loading" class="text-center py-5"><span class="spinner-border text-primary"></span></div>
  <div *ngIf="!loading && !shown.length" class="text-center text-muted py-5">No matching products.</div>

  <div class="pc-grid">
    <div *ngFor="let p of shown" class="pc-card" [class.in-cart]="countOf(p) > 0">
      <div class="pc-img">
        <img *ngIf="p.thumbnail; else noImg" [src]="p.thumbnail" [alt]="p.name" loading="lazy">
        <ng-template #noImg><i class="fas fa-box-open"></i></ng-template>
        <span *ngIf="countOf(p) > 0" class="pc-count"><i class="fas fa-check me-1"></i>{{ countOf(p) }} in {{ cartLabel }}</span>
      </div>
      <div class="pc-body">
        <div class="pc-name" [title]="p.name">{{ p.name }}</div>
        <div class="pc-code" *ngIf="p.code">{{ p.code }}</div>
        <div class="pc-variants">
          <button *ngFor="let v of p.variants" type="button" class="pc-variant"
                  [class.out]="p.stockManaged && (v.stock ?? 0) <= 0"
                  (click)="picked.emit({ product: p, variant: v })" [title]="'Add to ' + cartLabel">
            <span class="pv-name">{{ v.name }}</span>
            <span class="pv-price">{{ v.pricePaise | money }}</span>
            <span *ngIf="p.stockManaged" class="pv-stock" [class.low]="(v.stock ?? 0) > 0 && (v.stock ?? 0) <= 5" [class.none]="(v.stock ?? 0) <= 0">
              {{ (v.stock ?? 0) > 0 ? (v.stock + ' in stock') : 'Out of stock' }}
            </span>
            <i class="fas fa-plus pv-add"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
  <div *ngIf="!loading && filtered > shown.length" class="text-center mt-3">
    <button class="btn btn-sm btn-outline-primary" (click)="limit = limit + 24; filter()">Show more ({{ filtered - shown.length }})</button>
  </div>
  `,
  styles: [`
    .pc-cats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; align-items: center; }
    .pc-cats.sub { margin-top: -4px; padding-left: 4px; }
    .pc-cat { border: 1px solid #d6e3f1; background: #fff; color: #384350; border-radius: 999px; padding: 4px 12px; font-size: .8rem;
              cursor: pointer; transition: background .12s, color .12s, border-color .12s; }
    .pc-cat span { color: #8a94a0; font-size: .72rem; margin-left: 3px; }
    .pc-cat:hover { border-color: #065baa; color: #065baa; }
    .pc-cat.on { background: #065baa; border-color: #065baa; color: #fff; }
    .pc-cat.on span { color: rgba(255,255,255,.8); }
    .pc-cats.sub .pc-cat { padding: 2px 10px; font-size: .75rem; }
    .pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
    .pc-card { background: #fff; border: 1px solid #e6e9ee; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
               transition: box-shadow .15s, border-color .15s; }
    .pc-card:hover { box-shadow: 0 6px 18px rgba(6, 91, 170, .12); border-color: #c9dbef; }
    .pc-card.in-cart { border-color: #065baa; }
    .pc-img { position: relative; height: 130px; background: #f7f9fb; display: flex; align-items: center; justify-content: center; }
    .pc-img img { max-width: 100%; max-height: 100%; object-fit: contain; padding: 8px; }
    .pc-img > i { font-size: 2rem; color: #c3cad3; }
    .pc-count i { font-size: .65rem; color: inherit; }
    .pc-count { position: absolute; top: 8px; left: 8px; background: #065baa; color: #fff; font-size: .7rem; font-weight: 600;
                padding: 2px 8px; border-radius: 999px; }
    .pc-body { padding: 10px 12px 12px; display: flex; flex-direction: column; flex: 1; }
    .pc-name { font-weight: 600; font-size: .9rem; line-height: 1.25; color: #212529;
               display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .pc-code { font-size: .72rem; color: #8a94a0; margin-top: 2px; }
    .pc-variants { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
    .pc-variant { position: relative; text-align: left; border: 1px solid #d6e3f1; background: #f5f9fd; border-radius: 8px;
                  padding: 6px 30px 6px 9px; cursor: pointer; transition: background .12s, border-color .12s; }
    .pc-variant:hover { background: #065baa; border-color: #065baa; }
    .pc-variant:hover .pv-name, .pc-variant:hover .pv-price, .pc-variant:hover .pv-stock, .pc-variant:hover .pv-add { color: #fff; }
    .pc-variant.out { background: #f8f8f8; border-color: #e3e3e3; }
    .pv-name { display: block; font-size: .78rem; color: #495057; line-height: 1.2; }
    .pv-price { font-weight: 700; font-size: .88rem; color: #065baa; }
    .pv-stock { font-size: .7rem; color: #198754; margin-left: 6px; }
    .pv-stock.low { color: #b7791f; }
    .pv-stock.none { color: #9aa1a9; }
    .pv-add { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #065baa; font-size: .8rem; }
  `]
})
export class ProductCardsComponent implements OnInit {
  private readonly ops = inject(AdminOpsApi);
  private readonly admin = inject(AdminApi);
  @Output() picked = new EventEmitter<PickedVariant>();
  /** qty per variantId already in the quote, for the "in quote" badge */
  @Input() inCart: Record<string, number> = {};
  /** word used on the badge / tooltip: "quote" (Quotations) or "order" (staff order) */
  @Input() cartLabel = 'quote';

  all: PickerProduct[] = [];
  shown: PickerProduct[] = [];
  filtered = 0;
  limit = 24;
  q = '';
  loading = false;

  // categories
  cats: Category[] = [];
  topCats: Category[] = [];
  subCats: Category[] = [];
  subParent: string | null = null;
  catId: string | null = null;
  uncategorised = 0;
  private productCats = new Map<string, string[]>();   // productId -> categoryIds
  private catProducts = new Map<string, Set<string>>(); // categoryId (incl. descendants) -> productIds

  ngOnInit(): void { this.reload(); this.loadCategories(); }

  reload(): void {
    this.loading = true;
    this.ops.catalogPicker().subscribe({
      next: r => { this.all = r.products; this.indexCategories(); this.filter(); this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  /** Category names + which product is in which category. Optional: without access the chips simply don't show. */
  private async loadCategories(): Promise<void> {
    try {
      const [c, products] = await Promise.all([firstValueFrom(this.admin.admin.categories()), loadAllProducts(this.admin)]);
      this.cats = (c.categories ?? []).filter(x => x.active !== false);
      products.forEach(p => this.productCats.set(p.id, p.categoryIds ?? []));
      this.indexCategories();
      this.filter();
    } catch { /* no category access: search only */ }
  }

  private indexCategories(): void {
    if (!this.cats.length || !this.all.length) return;
    const ids = new Set(this.cats.map(c => c.id));
    const ancestors = (id: string): string[] => {
      const out: string[] = [];
      let cur = this.cats.find(c => c.id === id);
      while (cur) { out.push(cur.id); cur = cur.parentId ? this.cats.find(c => c.id === cur!.parentId) : undefined; }
      return out;
    };
    this.catProducts.clear();
    this.uncategorised = 0;
    for (const p of this.all) {
      const own = (this.productCats.get(p.productId) ?? []).filter(id => ids.has(id));
      if (!own.length) { this.uncategorised++; continue; }
      for (const id of own) for (const a of ancestors(id)) {
        if (!this.catProducts.has(a)) this.catProducts.set(a, new Set());
        this.catProducts.get(a)!.add(p.productId);
      }
    }
    const order = (a: Category, b: Category) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name);
    this.topCats = this.cats.filter(c => (!c.parentId || !ids.has(c.parentId)) && this.countIn(c.id) > 0).sort(order);
    this.updateSubCats();
  }

  private updateSubCats(): void {
    const top = this.catId && this.catId !== '_none' ? (this.parentOf(this.catId) ?? this.catId) : null;
    this.subParent = top;
    const order = (a: Category, b: Category) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name);
    this.subCats = top ? this.cats.filter(c => c.parentId === top && this.countIn(c.id) > 0).sort(order) : [];
  }

  pickCat(id: string | null): void { this.catId = id; this.limit = 24; this.updateSubCats(); this.filter(); }
  countIn(id: string): number { return this.catProducts.get(id)?.size ?? 0; }
  parentOf(id: string | null): string | undefined { return id ? this.cats.find(c => c.id === id)?.parentId : undefined; }
  nameOf(id: string | null): string { return this.cats.find(c => c.id === id)?.name ?? ''; }

  filter(): void {
    const n = this.q.trim().toLowerCase();
    let list = this.all;
    if (this.catId === '_none') list = list.filter(p => !this.topCats.some(c => this.catProducts.get(c.id)?.has(p.productId)));
    else if (this.catId) { const set = this.catProducts.get(this.catId); list = list.filter(p => !!set?.has(p.productId)); }
    if (n) list = list.filter(p => p.name.toLowerCase().includes(n) || (p.code ?? '').toLowerCase().includes(n)
      || p.variants.some(v => (v.sku ?? '').toLowerCase().includes(n) || v.name.toLowerCase().includes(n)));
    this.filtered = list.length;
    this.shown = list.slice(0, this.limit);
  }

  countOf(p: PickerProduct): number {
    return p.variants.reduce((s, v) => s + (this.inCart[v.variantId] ?? 0), 0);
  }

  /** Stock and thumbnail for a variant already in the quote (lines loaded from the server don't carry them). */
  infoOf(variantId: string): { stock?: number; thumbnail?: string } | undefined {
    for (const p of this.all) {
      const v = p.variants.find(x => x.variantId === variantId);
      if (v) return { stock: p.stockManaged ? (v.stock ?? 0) : undefined, thumbnail: p.thumbnail };
    }
    return undefined;
  }
}
