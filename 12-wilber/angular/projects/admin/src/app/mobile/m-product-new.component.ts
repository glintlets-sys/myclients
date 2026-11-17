import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../core/admin-api';
import { Category, Product } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';

interface PackForm { name: string; price: number | null; stock: number | null; }

/** Quick "new product" on the phone, always inside a category (Categories → Add product). */
@Component({
  selector: 'app-m-product-new',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="m-page has-sticky">
    <div class="m-alert info" *ngIf="category"><i class="fas fa-tag me-1"></i>Adding to <b>{{ category.name }}</b></div>
    <div class="m-alert bad" *ngIf="!category && loaded">Open this from Categories → Add product.</div>

    <div class="m-gallery">
      <img *ngFor="let img of images" [src]="img" alt="">
      <label class="m-gallery-add" [class.busy]="uploading">
        <input type="file" accept="image/*" capture="environment" (change)="addPhoto($event)" hidden>
        <i class="fas" [ngClass]="uploading ? 'fa-spinner fa-spin' : 'fa-camera'"></i><span>Add photo</span>
      </label>
    </div>

    <section class="m-sheet">
      <label class="m-label">Product name *</label><input class="m-input" [(ngModel)]="name">
      <label class="m-label">Product code</label><input class="m-input" [(ngModel)]="code" placeholder="e.g. REG-999">
      <label class="m-label">Brand</label><input class="m-input" [(ngModel)]="brand">
      <label class="m-label">Short description</label><textarea class="m-input" rows="3" [(ngModel)]="shortDescription"></textarea>
      <label class="m-switch mt-2"><input type="checkbox" [(ngModel)]="active"><span></span><b>Show in the store now</b></label>
    </section>

    <section class="m-sheet">
      <h3 class="m-sheet-h">Pack sizes</h3>
      <div *ngFor="let v of packs; let i = index" class="m-variant-edit">
        <div class="m-card-top"><b>Pack {{ i + 1 }}</b>
          <button *ngIf="packs.length > 1" class="m-icon-btn" (click)="packs.splice(i, 1)" aria-label="Remove"><i class="fas fa-trash"></i></button></div>
        <input class="m-input" [(ngModel)]="v.name" placeholder="e.g. 1 Litre, 20 KG">
        <div class="m-inline mt-2">
          <input class="m-input" type="number" inputmode="decimal" [(ngModel)]="v.price" placeholder="Price ₹">
          <input class="m-input" type="number" inputmode="numeric" [(ngModel)]="v.stock" placeholder="Stock">
        </div>
      </div>
      <button class="m-btn ghost block" (click)="packs.push({ name: '', price: null, stock: null })"><i class="fas fa-plus"></i>Another pack size</button>
    </section>

    <div class="m-sticky"><button class="m-btn primary block" (click)="save()" [disabled]="saving || !category">
      <span *ngIf="saving" class="spinner-border spinner-border-sm"></span> Create product</button></div>
  </div>
  `
})
export class MProductNewComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toaster = inject(ToasterService);

  category: Category | null = null;
  loaded = false;
  name = '';
  code = '';
  brand = '';
  shortDescription = '';
  active = true;
  images: string[] = [];
  packs: PackForm[] = [{ name: '', price: null, stock: null }];
  saving = false;
  uploading = false;

  ngOnInit(): void {
    const id = this.route.snapshot.queryParamMap.get('category');
    this.api.admin.categories().subscribe({
      next: r => { this.category = r.categories.find(c => c.id === id) ?? null; this.loaded = true; },
      error: () => (this.loaded = true)
    });
  }

  async addPhoto(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading = true;
    try { this.images = [...this.images, await this.api.upload(file)]; }
    catch (e) { this.toaster.showToast(apiErrorMessage(e, 'Image upload failed'), ToastType.Error, 5000); }
    this.uploading = false;
    input.value = '';
  }

  async save(): Promise<void> {
    const packs = this.packs.filter(p => p.name.trim());
    if (!this.name.trim()) { this.toaster.showToast('Enter the product name', ToastType.Warn); return; }
    if (!packs.length || packs.some(p => !(Number(p.price) > 0))) { this.toaster.showToast('Each pack size needs a name and a price', ToastType.Warn); return; }
    this.saving = true;
    try {
      const body: Partial<Product> = {
        name: this.name.trim(), code: this.code.trim() || undefined, brand: this.brand.trim() || undefined,
        shortDescription: this.shortDescription.trim() || undefined, categoryIds: [this.category!.id],
        images: this.images, thumbnail: this.images[0], active: this.active,
        specs: [], features: [], applications: [], considerations: [], howToApply: [],
        variants: packs.map(p => ({ id: '', name: p.name.trim(), pricePaise: Math.round(Number(p.price) * 100), mrpPaise: 0, active: true })) as any,
      };
      (body.variants as any[]).forEach(v => delete v.id);
      const saved = await firstValueFrom(this.api.admin.createProduct(body));
      for (const [i, v] of saved.variants.entries()) {
        const qty = Number(packs[i]?.stock);
        if (qty > 0) await firstValueFrom(this.api.admin.setStock(v.id, { qty, productId: saved.id }));
      }
      this.toaster.showToast('Product created', ToastType.Success);
      this.router.navigate(['/m/products', saved.id], { replaceUrl: true });
    } catch (e) {
      this.toaster.showToast(apiErrorMessage(e, 'Could not create the product'), ToastType.Error, 5000);
    }
    this.saving = false;
  }
}
