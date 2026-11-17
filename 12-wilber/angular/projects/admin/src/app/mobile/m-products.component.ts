import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../core/admin-api';
import { Category, Product } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { WebImgPipe } from './m-img.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { loadAllProducts } from '../admin/admin-recommendations/recommendations';

/** Product list: search, category chips, stock filter; tap a card to edit price / stock / visibility. */
@Component({
  selector: 'app-m-products',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MoneyPipe, WebImgPipe],
  template: `
  <div class="m-page">
    <div class="m-search"><i class="fas fa-search"></i>
      <input type="search" [(ngModel)]="q" placeholder="Search name, code, brand or SKU"></div>
    <div class="m-chips">
      <button [class.on]="!cat && !stock" (click)="cat = ''; stock = ''">All <span>{{ all.length }}</span></button>
      <button [class.on]="stock === 'low'" (click)="stock = stock === 'low' ? '' : 'low'"><i class="fas fa-exclamation-triangle me-1"></i>Low / out</button>
      <button [class.on]="stock === 'hidden'" (click)="stock = stock === 'hidden' ? '' : 'hidden'">Hidden</button>
      <button *ngFor="let c of leafCats" [class.on]="cat === c.id" (click)="cat = cat === c.id ? '' : c.id">{{ c.name }}</button>
    </div>
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div *ngIf="loading" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>

    <div class="m-list">
      <a *ngFor="let p of shown" class="m-card m-prod-card" [routerLink]="['/m/products', p.id]" [class.dim]="!p.active">
        <img *ngIf="p.thumbnail || p.images?.[0]; else noImg" [src]="(p.thumbnail || p.images[0]) | webImg" alt="" loading="lazy">
        <ng-template #noImg><span class="m-noimg"><i class="fas fa-box-open"></i></span></ng-template>
        <div class="m-prod-body">
          <b>{{ p.name }}</b>
          <small>{{ catName(p) }}</small>
          <div class="m-card-tags">
            <span class="m-pill muted">from {{ minPrice(p) | money }}</span>
            <span class="m-pill" [ngClass]="stockTone(p)">{{ stockText(p) }}</span>
            <span *ngIf="!p.active" class="m-pill bad">Hidden</span>
          </div>
        </div>
        <i class="fas fa-chevron-right m-chev"></i>
      </a>
    </div>
    <div *ngIf="!loading && !shown.length" class="m-empty"><i class="fas fa-box-open"></i>No products match.</div>

    <a routerLink="/m/categories" class="m-fab" aria-label="Add product"><i class="fas fa-plus"></i></a>
  </div>
  `
})
export class MProductsComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  all: Product[] = [];
  cats: Category[] = [];
  q = '';
  cat = '';
  stock = '';
  loading = false;
  error = '';

  get leafCats(): Category[] {
    const parents = new Set(this.cats.map(c => c.parentId).filter(Boolean));
    return this.cats.filter(c => !parents.has(c.id) && this.all.some(p => p.categoryIds?.includes(c.id)));
  }

  get shown(): Product[] {
    const n = this.q.trim().toLowerCase();
    return this.all.filter(p => {
      if (this.cat && !p.categoryIds?.includes(this.cat)) return false;
      if (this.stock === 'low' && !this.isLow(p)) return false;
      if (this.stock === 'hidden' && p.active) return false;
      if (!n) return true;
      return [p.name, p.code, p.brand, ...p.variants.map(v => v.sku ?? ''), ...p.variants.map(v => v.name)].join(' ').toLowerCase().includes(n);
    });
  }

  async ngOnInit(): Promise<void> {
    this.stock = this.route.snapshot.queryParamMap.get('stock') ?? '';
    this.cat = this.route.snapshot.queryParamMap.get('category') ?? '';
    this.loading = true;
    try {
      const [products, cats] = await Promise.all([loadAllProducts(this.api), firstValueFrom(this.api.admin.categories())]);
      this.all = products.sort((a, b) => a.name.localeCompare(b.name));
      this.cats = [...cats.categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    } catch (e) {
      this.error = apiErrorMessage(e, 'Could not load products');
    }
    this.loading = false;
  }

  catName(p: Product): string {
    return (p.categoryIds ?? []).map(id => this.cats.find(c => c.id === id)?.name).filter(Boolean).join(', ') || 'No category';
  }

  minPrice(p: Product): number {
    const prices = p.variants.filter(v => v.active !== false).map(v => v.pricePaise).filter(x => x > 0);
    return prices.length ? Math.min(...prices) : 0;
  }

  private isLow(p: Product): boolean {
    return (p as any).stockManaged !== false && p.variants.some(v => v.active !== false && (v.stock ?? 0) <= 5);
  }

  stockText(p: Product): string {
    if ((p as any).stockManaged === false) return 'Stock not tracked';
    const total = p.variants.filter(v => v.active !== false).reduce((s, v) => s + Math.max(0, v.stock ?? 0), 0);
    return total > 0 ? `${total} in stock` : 'Out of stock';
  }

  stockTone(p: Product): string {
    if ((p as any).stockManaged === false) return 'muted';
    const out = p.variants.filter(v => v.active !== false).every(v => (v.stock ?? 0) <= 0);
    return out ? 'bad' : this.isLow(p) ? 'warn' : 'ok';
  }
}
