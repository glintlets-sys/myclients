import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../core/admin-api';
import { Category, Product } from '@shared/core/models';
import { forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { AddEditCategoryComponent } from './add-edit-category/add-edit-category.component';

@Component({
  selector: 'app-admin-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, AddEditCategoryComponent],
  templateUrl: './admin-categories.component.html',
  styleUrl: './admin-categories.component.scss'
})
export class AdminCategoriesComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);
  /** "Add product" on a category row: the admin shell opens Manage Products with the editor pre-set to this category. */
  @Output() addProduct = new EventEmitter<string>();

  categories: Category[] = [];
  filteredCategories: Category[] = [];
  searchTerm = '';
  isLoading = false;
  isSaving = false;
  count = 0;
  /** categoryId → number of products (incl. inactive) assigned to it. */
  productCounts: Record<string, number> = {};
  /** Full product list (for the "add existing products to a category" picker). */
  allProducts: Product[] = [];

  showAddEditModal = false;
  selectedCategory: Category | null = null;

  // --- Add existing products to a category (products are many-to-many with categories) ---
  showAddProductsModal = false;
  addToCategory: Category | null = null;
  productSearch = '';
  selectedToAdd = new Set<string>();
  isAddingProducts = false;

  openAddProductsModal(category: Category): void {
    this.addToCategory = category;
    this.productSearch = '';
    this.selectedToAdd = new Set<string>();
    this.showAddProductsModal = true;
  }

  closeAddProductsModal(): void {
    this.showAddProductsModal = false;
    this.addToCategory = null;
    this.selectedToAdd = new Set<string>();
  }

  /** LEFT pane — active products NOT already in the target category, filtered by the search box. */
  get eligibleProducts(): Product[] {
    const cat = this.addToCategory;
    if (!cat) return [];
    const term = this.productSearch.trim().toLowerCase();
    return this.allProducts
      .filter(p => !(p.categoryIds ?? []).includes(cat.id) &&
        (!term || p.name.toLowerCase().includes(term) || (p.code ?? '').toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** RIGHT pane — products already in this category. */
  get inCategoryProducts(): Product[] {
    const cat = this.addToCategory;
    if (!cat) return [];
    return this.allProducts.filter(p => (p.categoryIds ?? []).includes(cat.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  toggleProduct(id: string): void {
    if (this.selectedToAdd.has(id)) this.selectedToAdd.delete(id);
    else this.selectedToAdd.add(id);
  }

  /** Add the left-pane selection to the category; keep the modal open so membership can be managed in place. */
  saveAddProducts(): void {
    const cat = this.addToCategory;
    if (!cat || this.selectedToAdd.size === 0 || this.isAddingProducts) return;
    this.isAddingProducts = true;
    const ids = [...this.selectedToAdd];
    // PUT /products/{id} replaces the whole product, so load the full product first and send it back with the
    // category added — a partial body ({ categoryIds }) wipes name/variants and fails with "no product name".
    const updates = ids.map(pid =>
      this.api.admin.product(pid).pipe(
        switchMap(full => this.api.admin.updateProduct(pid, {
          ...full,
          categoryIds: [...new Set([...(full.categoryIds ?? []), cat.id])],
        }))
      ));
    forkJoin(updates).subscribe({
      next: () => {
        for (const pid of ids) {   // reflect locally so both panes update without a reload
          const p = this.allProducts.find(x => x.id === pid);
          if (p) p.categoryIds = [...new Set([...(p.categoryIds ?? []), cat.id])];
        }
        this.productCounts[cat.id] = (this.productCounts[cat.id] ?? 0) + ids.length;
        this.toaster.showToast(`${ids.length} product(s) added to ${cat.name}`, ToastType.Success, 2500);
        this.selectedToAdd = new Set<string>();
        this.isAddingProducts = false;
      },
      error: err => {
        this.isAddingProducts = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not add products to the category'), ToastType.Error, 4000);
      }
    });
  }

  /** Detach a product from this category (products are many-to-many; its other categories are untouched). */
  removeFromCategory(p: Product): void {
    const cat = this.addToCategory;
    if (!cat || this.isAddingProducts) return;
    this.isAddingProducts = true;
    const categoryIds = (p.categoryIds ?? []).filter(id => id !== cat.id);
    // Full-replace PUT: load the product and send it back with the category dropped, not a partial body.
    this.api.admin.product(p.id).pipe(
      switchMap(full => this.api.admin.updateProduct(p.id, {
        ...full,
        categoryIds: (full.categoryIds ?? []).filter(id => id !== cat.id),
      }))
    ).subscribe({
      next: () => {
        const prod = this.allProducts.find(x => x.id === p.id);
        if (prod) prod.categoryIds = categoryIds;
        this.productCounts[cat.id] = Math.max(0, (this.productCounts[cat.id] ?? 1) - 1);
        this.toaster.showToast(`${p.name} removed from ${cat.name}`, ToastType.Success, 2500);
        this.isAddingProducts = false;
      },
      error: err => {
        this.isAddingProducts = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not remove the product'), ToastType.Error, 4000);
      }
    });
  }

  ngOnInit(): void {
    this.loadCategoriesFromBackend();
  }

  loadCategoriesFromBackend(): void {
    this.isLoading = true;
    this.api.admin.categories().subscribe({
      next: res => {
        this.categories = [...res.categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        this.applyFilters();
        this.isLoading = false;
      },
      error: err => {
        this.isLoading = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not load categories'), ToastType.Error, 4000);
      }
    });
    this.api.admin.products({ size: 500 }).subscribe({
      next: res => {
        this.allProducts = res.items ?? [];
        const counts: Record<string, number> = {};
        for (const p of this.allProducts) for (const id of p.categoryIds ?? []) counts[id] = (counts[id] ?? 0) + 1;
        this.productCounts = counts;
      },
      error: () => { this.productCounts = {}; this.allProducts = []; }
    });
  }

  applyFilters(): void {
    const term = this.searchTerm.toLowerCase();
    const hits = new Set(this.categories.filter(c =>
      c.name.toLowerCase().includes(term) || (c.description ?? '').toLowerCase().includes(term) || c.slug.includes(term)));
    // tree order: each parent, then its sub-categories (indented in the table)
    const ids = new Set(this.categories.map(c => c.id));
    const parentOf = (c: Category) => (c.parentId && ids.has(c.parentId) ? c.parentId : undefined);
    const ordered: Category[] = [];
    const add = (parentId: string | undefined, level: number) => {
      if (level > 5) return;
      for (const c of this.categories.filter(x => parentOf(x) === parentId)) {
        if (hits.has(c)) ordered.push(c);
        add(c.id, level + 1);
      }
    };
    add(undefined, 0);
    this.filteredCategories = ordered;
    this.count = this.filteredCategories.length;
  }

  /** How deep a category sits (0 = top level), for the indent in the table. */
  depth(c: Category): number {
    let d = 0, p = c.parentId;
    while (p && d < 5) { const parent = this.categories.find(x => x.id === p); if (!parent) break; d++; p = parent.parentId; }
    return d;
  }

  childCount(c: Category): number { return this.categories.filter(x => x.parentId === c.id).length; }

  /** The category's own image; otherwise a neutral blank placeholder (no slug-guessed URL). */
  imageOf(c: Category): string {
    return c.image || c.bannerImage || 'assets/images/image_empty.jpg';
  }

  filterData(): void {
    this.applyFilters();
  }

  getParentCategory(category: Category): string {
    if (!category.parentId) return 'Root Category';
    return this.categories.find(c => c.id === category.parentId)?.name ?? '';
  }

  refreshCategories(): void {
    this.loadCategoriesFromBackend();
  }

  openAddEditPopupForCategory(category: Category | string): void {
    this.selectedCategory = typeof category === 'string'
      ? { id: '', slug: '', name: '', description: '', image: '', active: true, sortOrder: this.categories.length }
      : { ...category };
    this.showAddEditModal = true;
  }

  closeModal(): void {
    this.showAddEditModal = false;
    this.selectedCategory = null;
  }

  onSaveCategory(category: Category): void {
    const body: Partial<Category> = {
      name: category.name.trim(),
      slug: category.slug?.trim() || undefined,
      description: category.description?.trim() || undefined,
      image: category.image || undefined,
      bannerImage: category.bannerImage || undefined,
      parentId: category.parentId || undefined,
      sortOrder: Number(category.sortOrder) || 0,
      active: category.active !== false,
      seoTitle: category.seoTitle?.trim() || undefined,
      seoDescription: category.seoDescription?.trim() || undefined,
      marketing: !!category.marketing,
      marketingDisplay: category.marketing ? (category.marketingDisplay || 'image') : undefined,
    };
    const call = category.id ? this.api.admin.updateCategory(category.id, body) : this.api.admin.createCategory(body);
    this.isSaving = true;
    call.subscribe({
      next: () => {
        this.isSaving = false;
        this.toaster.showToast(category.id ? 'Category updated' : 'Category created', ToastType.Success, 3000);
        this.closeModal();
        this.loadCategoriesFromBackend();
      },
      error: err => {
        this.isSaving = false;
        this.toaster.showToast(apiErrorMessage(err, 'Could not save the category'), ToastType.Error, 5000);
      }
    });
  }

  deleteCategory(category: Category): void {
    if (!confirm(`Delete the category "${category.name}"?`)) return;
    this.api.admin.deleteCategory(category.id).subscribe({
      next: () => {
        this.toaster.showToast('Category deleted', ToastType.Success, 3000);
        this.loadCategoriesFromBackend();
      },
      error: err => this.toaster.showToast(apiErrorMessage(err, 'Could not delete the category'), ToastType.Error, 5000)
    });
  }
}
