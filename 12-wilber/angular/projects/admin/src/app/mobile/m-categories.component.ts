import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../core/admin-api';
import { Category } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { loadAllProducts } from '../admin/admin-recommendations/recommendations';

/** Category tree (parent → sub-categories) with product counts; "Add product" starts a product in that category. */
@Component({
  selector: 'app-m-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
  <div class="m-page">
    <p class="m-hint"><i class="fas fa-info-circle me-1"></i>New products are added from their category: tap <b>+ Add product</b>.</p>
    <div *ngIf="error" class="m-alert bad">{{ error }}</div>
    <div *ngIf="loading" class="m-loading"><span class="spinner-border spinner-border-sm"></span></div>
    <ng-container *ngFor="let g of groups">
      <h2 class="m-h">{{ g.parent.name }} <small *ngIf="!g.parent.active" class="m-pill bad">Hidden</small></h2>
      <div class="m-list">
        <div *ngFor="let c of g.children.length ? g.children : [g.parent]" class="m-row">
          <a class="m-row-main" [routerLink]="['/m/products']" [queryParams]="{ category: c.id }">
            <b>{{ c.name }}</b><small>{{ counts[c.id] || 0 }} products<span *ngIf="c.active === false"> · hidden</span></small></a>
          <a class="m-btn small primary" [routerLink]="['/m/products/new']" [queryParams]="{ category: c.id }"><i class="fas fa-plus"></i>Add product</a>
        </div>
      </div>
    </ng-container>

    <h2 class="m-h">New category</h2>
    <section class="m-sheet">
      <input class="m-input" [(ngModel)]="newName" placeholder="Category name">
      <select class="m-input mt-2" [(ngModel)]="newParent"><option value="">Top level</option>
        <option *ngFor="let g of groups" [value]="g.parent.id">Under {{ g.parent.name }}</option></select>
      <button class="m-btn primary block mt-2" (click)="create()" [disabled]="busy || !newName.trim()">Create category</button>
    </section>
  </div>
  `
})
export class MCategoriesComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);
  groups: { parent: Category; children: Category[] }[] = [];
  counts: Record<string, number> = {};
  loading = false;
  busy = false;
  error = '';
  newName = '';
  newParent = '';

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const [r, products] = await Promise.all([firstValueFrom(this.api.admin.categories()), loadAllProducts(this.api)]);
      const all = [...r.categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const ids = new Set(all.map(c => c.id));
      this.groups = all.filter(c => !c.parentId || !ids.has(c.parentId)).map(parent => ({ parent, children: all.filter(c => c.parentId === parent.id) }));
      const counts: Record<string, number> = {};
      for (const p of products) for (const id of p.categoryIds ?? []) counts[id] = (counts[id] ?? 0) + 1;
      this.counts = counts;
    } catch (e) {
      this.error = apiErrorMessage(e, 'Could not load categories');
    }
    this.loading = false;
  }

  create(): void {
    this.busy = true;
    this.api.admin.createCategory({ name: this.newName.trim(), parentId: this.newParent || undefined, active: true,
      sortOrder: this.groups.length * 10 }).subscribe({
      next: () => { this.busy = false; this.newName = ''; this.toaster.showToast('Category created', ToastType.Success); this.load(); },
      error: e => { this.busy = false; this.toaster.showToast(apiErrorMessage(e), ToastType.Error, 4000); }
    });
  }
}
