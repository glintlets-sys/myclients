import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../core/admin-api';
import { Category, Product } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { WebImgPipe } from './m-img.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { openDesktop } from './m-common';

interface VariantEdit { id: string; name: string; sku?: string; price: number; stock: number | null; originalStock: number | null; active: boolean; }

/**
 * Edit a product on the phone: photos, name, short description, visibility, and per pack size the price and stock.
 * Long-form content (specs, how to apply, SEO) stays on the desktop editor — linked at the bottom.
 */
@Component({
  selector: 'app-m-product',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MoneyPipe, WebImgPipe],
  template: `
  <div class="m-page has-sticky" *ngIf="p; else loadingTpl">
    <div class="m-gallery">
      <img *ngFor="let img of p.images" [src]="img | webImg" alt="">
      <label class="m-gallery-add" [class.busy]="uploading">
        <input type="file" accept="image/*" capture="environment" (change)="addPhoto($event)" hidden>
        <i class="fas" [ngClass]="uploading ? 'fa-spinner fa-spin' : 'fa-camera'"></i><span>Add photo</span>
      </label>
    </div>

    <section class="m-sheet">
      <label class="m-switch"><input type="checkbox" [(ngModel)]="p.active"><span></span>
        <b>{{ p.active ? 'Shown in the store' : 'Hidden from the store' }}</b></label>
      <label class="m-label">Name</label><input class="m-input" [(ngModel)]="p.name">
      <label class="m-label">Brand</label><input class="m-input" [(ngModel)]="p.brand">
      <label class="m-label">Short description</label><textarea class="m-input" rows="3" [(ngModel)]="p.shortDescription"></textarea>
      <label class="m-label">Categories</label>
      <div class="m-chips wrap">
        <button *ngFor="let c of cats" [class.on]="p.categoryIds.includes(c.id)" (click)="toggleCat(c.id)">{{ c.name }}</button>
      </div>
    </section>

    <section class="m-sheet">
      <h3 class="m-sheet-h">Pack sizes</h3>
      <div *ngFor="let v of variants" class="m-variant-edit" [class.dim]="!v.active">
        <div class="m-card-top"><b>{{ v.name }}</b>
          <label class="m-switch sm"><input type="checkbox" [(ngModel)]="v.active"><span></span></label></div>
        <div class="m-inline">
          <div><label class="m-label">Price (₹)</label><input class="m-input" type="number" inputmode="decimal" min="0" [(ngModel)]="v.price"></div>
          <div *ngIf="stockManaged"><label class="m-label">Stock</label>
            <div class="m-stepper wide">
              <button (click)="v.stock = (v.stock ?? 0) - 1" aria-label="Less"><i class="fas fa-minus"></i></button>
              <input type="number" inputmode="numeric" [(ngModel)]="v.stock">
              <button (click)="v.stock = (v.stock ?? 0) + 1" aria-label="More"><i class="fas fa-plus"></i></button>
            </div></div>
        </div>
        <small *ngIf="v.sku" class="m-muted">SKU {{ v.sku }}</small>
      </div>
    </section>

    <button class="m-btn ghost block" (click)="desktop()"><i class="fas fa-desktop"></i>Full editor (desktop view)</button>

    <div class="m-sticky"><button class="m-btn primary block" (click)="save()" [disabled]="saving">
      <span *ngIf="saving" class="spinner-border spinner-border-sm"></span> Save changes</button></div>
  </div>
  <ng-template #loadingTpl><div class="m-page"><div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div *ngIf="!error" class="m-loading"><span class="spinner-border"></span></div></div></ng-template>
  `
})
export class MProductComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toaster = inject(ToasterService);

  p: Product | null = null;
  cats: Category[] = [];
  variants: VariantEdit[] = [];
  stockManaged = true;
  error = '';
  saving = false;
  uploading = false;
  desktop(): void { openDesktop('products'); }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.admin.categories().subscribe({ next: r => (this.cats = r.categories.filter(c => c.active !== false)), error: () => {} });
    this.api.admin.product(id).subscribe({
      next: p => {
        this.p = { ...p, categoryIds: [...(p.categoryIds ?? [])], images: [...(p.images ?? [])] };
        this.stockManaged = (p as any).stockManaged !== false;
        this.variants = p.variants.map(v => ({ id: v.id, name: v.name, sku: v.sku, price: v.pricePaise / 100,
          stock: v.stock ?? 0, originalStock: v.stock ?? 0, active: v.active !== false }));
      },
      error: e => (this.error = apiErrorMessage(e, 'Could not load the product'))
    });
  }

  toggleCat(id: string): void {
    if (!this.p) return;
    this.p.categoryIds = this.p.categoryIds.includes(id) ? this.p.categoryIds.filter(x => x !== id) : [...this.p.categoryIds, id];
  }

  async addPhoto(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.p) return;
    this.uploading = true;
    try {
      this.p.images = [...this.p.images, await this.api.upload(file)];
      if (!this.p.thumbnail) this.p.thumbnail = this.p.images[0];
    } catch (e) {
      this.toaster.showToast(apiErrorMessage(e, 'Image upload failed'), ToastType.Error, 5000);
    }
    this.uploading = false;
    input.value = '';
  }

  async save(): Promise<void> {
    const p = this.p;
    if (!p) return;
    if (!p.name.trim()) { this.toaster.showToast('Name is required', ToastType.Warn); return; }
    if (this.variants.some(v => v.active && !(Number(v.price) > 0))) { this.toaster.showToast('Every active pack size needs a price', ToastType.Warn); return; }
    this.saving = true;
    try {
      const body: Partial<Product> = {
        ...p,
        name: p.name.trim(),
        variants: p.variants.map(v => {
          const e = this.variants.find(x => x.id === v.id)!;
          return { ...v, pricePaise: Math.round(Number(e.price) * 100), active: e.active };
        }),
      };
      await firstValueFrom(this.api.admin.updateProduct(p.id, body));
      if (this.stockManaged) {
        for (const v of this.variants) {
          const qty = Math.round(Number(v.stock ?? 0));
          if (qty !== v.originalStock) {
            await firstValueFrom(this.api.admin.setStock(v.id, { qty, productId: p.id, expectedQty: v.originalStock ?? undefined }));
            v.originalStock = qty;
          }
        }
      }
      this.toaster.showToast('Saved', ToastType.Success);
      this.router.navigate(['/m/products']);
    } catch (e) {
      this.toaster.showToast(apiErrorMessage(e, 'Could not save'), ToastType.Error, 5000);
    }
    this.saving = false;
  }
}
