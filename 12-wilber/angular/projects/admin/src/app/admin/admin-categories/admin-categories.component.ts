import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../core/admin-api';
import { Category } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { AddEditCategoryComponent } from './add-edit-category/add-edit-category.component';
import { environment } from '../../../environments/environment';

/**
 * Photos the storefront already ships (from the old wilber.co.in pages), shown here until a category gets
 * its own image in admin — an uploaded image always wins. Keyed by category slug.
 */
const STORE_IMAGES: Record<string, string> = {
  ...Object.fromEntries(['cementitious-tile-adhesive', 'epoxy-grout', 'sealers', 'cleaners', 'mastic', 'epoxy-products',
    'ager-polish', 'lapizo-bond', 'crystalizer', 'marble-densifier'].map(s => [s, `assets/images/categories/${s}.jpg`])),
  'industrial-solutions': 'assets/images/IndustrialSolutions.jpg',
  'stone-solutions': 'assets/images/stonesolution.jpg',
  crystalizer: 'assets/images/categories/crystalizer-v2.jpg',   // matches live admin build of 6 Nov 17:05
};

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

  showAddEditModal = false;
  selectedCategory: Category | null = null;

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
    this.api.admin.products({ size: 200 }).subscribe({
      next: res => {
        const counts: Record<string, number> = {};
        for (const p of res.items) for (const id of p.categoryIds ?? []) counts[id] = (counts[id] ?? 0) + 1;
        this.productCounts = counts;
      },
      error: () => { this.productCounts = {}; }
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

  /** Uploaded image, else the storefront's photo for this slug, else the empty placeholder. */
  imageOf(c: Category): string {
    const store = STORE_IMAGES[c.slug];
    return c.image || c.bannerImage || (store ? `${environment.storefrontUrl}/${store}` : 'assets/images/image_empty.jpg');
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
