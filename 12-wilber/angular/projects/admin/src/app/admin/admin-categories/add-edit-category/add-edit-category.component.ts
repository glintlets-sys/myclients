import { Component, Input, OnInit, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../../core/admin-api';
import { Category } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { SeoFieldsComponent, slugPreview } from '../../admin-seo/seo-fields.component';

@Component({
  selector: 'app-add-edit-category',
  standalone: true,
  imports: [CommonModule, FormsModule, SeoFieldsComponent],
  templateUrl: './add-edit-category.component.html',
  styleUrl: './add-edit-category.component.scss'
})
export class AddEditCategoryComponent implements OnInit {
  private readonly api = inject(AdminApi);
  readonly slugPreview = slugPreview;

  @Input() editCategoryData: Category | null = null;
  /** All categories, used to pick a parent. */
  @Input() categories: Category[] = [];
  @Input() saving = false;
  @Output() closePopup = new EventEmitter<void>();
  @Output() saveCategory = new EventEmitter<Category>();

  category: Category = { id: '', slug: '', name: '', description: '', image: '', active: true, sortOrder: 0 };
  parentCategories: Category[] = [];
  uploading: 'image' | 'bannerImage' | null = null;
  error = '';

  ngOnInit(): void {
    if (this.editCategoryData) this.category = { ...this.editCategoryData };
    // Only root categories can be parents; never the category itself (prevents cycles).
    this.parentCategories = this.categories.filter(c => !c.parentId && c.id !== this.category.id);
  }

  onSave(): void {
    this.error = '';
    if (!this.category.name?.trim()) {
      this.error = 'Please enter a category name';
      return;
    }
    this.saveCategory.emit(this.category);
  }

  onCancel(): void {
    this.closePopup.emit();
  }

  async onImageUpload(event: Event, field: 'image' | 'bannerImage' = 'image'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error = '';
    this.uploading = field;
    try {
      this.category[field] = await this.api.upload(file);
    } catch (err) {
      this.error = apiErrorMessage(err, 'Image upload failed');
    } finally {
      this.uploading = null;
      input.value = '';
    }
  }

  triggerFileInput(id = 'categoryImage'): void {
    (document.getElementById(id) as HTMLInputElement | null)?.click();
  }
}
