import { Component, Input, OnInit, Output, EventEmitter, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm, NgModel } from '@angular/forms';
import { AdminApi } from '../../../core/admin-api';
import { Product } from '@shared/core/models';
import { MoneyPipe } from '@shared/core/money.pipe';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { RECOMMENDATION_TYPES, RecommendationRow, RecommendationType, loadAllProducts, recommendationField } from '../recommendations';

@Component({
  selector: 'app-manage-recommendation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './manage-recommendation-modal.component.html',
  styleUrl: './manage-recommendation-modal.component.scss'
})
export class ManageRecommendationModalComponent implements OnInit {
  private readonly api = inject(AdminApi);

  /** The row being edited, or null to add a new one. */
  @Input() edit_recommended_item: RecommendationRow | null = null;
  /** All products (passed by the parent; loaded here if empty). */
  @Input() products: Product[] = [];
  @Output() closePopup = new EventEmitter<void>();
  @Output() saveRecommendation = new EventEmitter<RecommendationRow>();
  @ViewChild('myForm') myForm: NgForm;

  readonly recommendationTypes = RECOMMENDATION_TYPES;
  sourceId = '';
  type: RecommendationType | '' = '';
  searchToy = '';
  recommended_list: Product[] = [];
  toysPaginated: Product[] = [];
  saving = false;
  error = '';

  async ngOnInit(): Promise<void> {
    if (!this.products?.length) {
      try {
        this.products = await loadAllProducts(this.api);
      } catch (err) {
        this.error = apiErrorMessage(err, 'Could not load products');
      }
    }
    if (this.edit_recommended_item) {
      this.sourceId = this.edit_recommended_item.sourceId;
      this.type = this.edit_recommended_item.type;
    }
    this.loadEditData();
  }

  get isEdit(): boolean {
    return !!this.edit_recommended_item;
  }

  private product(id: string): Product | undefined {
    return this.products.find(p => p.id === id);
  }

  /** Loads the current list of the selected source product + type. */
  loadEditData(): void {
    const source = this.product(this.sourceId);
    const ids = source && this.type ? (source[recommendationField(this.type)] ?? []) : [];
    this.recommended_list = ids.map(id => this.product(id)).filter((p): p is Product => !!p);
    this.filterData();
  }

  onChangeLoad(): void {
    this.loadEditData();
  }

  filterData(): void {
    const term = this.searchToy.toLowerCase();
    const chosen = new Set(this.recommended_list.map(p => p.id));
    this.toysPaginated = this.products.filter(p =>
      p.id !== this.sourceId && !chosen.has(p.id) &&
      (!term || p.name?.toLowerCase().includes(term) || p.code?.toLowerCase().includes(term) || p.brand?.toLowerCase().includes(term)));
  }

  addSelectedToys(p: Product): void {
    this.recommended_list.push(p);
    this.filterData();
  }

  removeSelectedToys(p: Product): void {
    this.recommended_list = this.recommended_list.filter(x => x.id !== p.id);
    this.filterData();
  }

  minPrice(p: Product): number {
    const prices = (p.variants ?? []).map(v => v.pricePaise).filter(x => x > 0);
    return prices.length ? Math.min(...prices) : 0;
  }

  controlHasError(validation: string, control: NgModel): boolean {
    return control?.control?.hasError(validation) && (control.dirty || control.touched);
  }

  saveRecommendedItem(): void {
    this.error = '';
    if (!this.myForm.valid || !this.sourceId || !this.type) {
      Object.values(this.myForm.controls).forEach(c => c.markAsTouched());
      return;
    }
    if (!this.recommended_list.length) {
      this.error = 'Please add at least one recommended product';
      return;
    }
    const type = this.type;
    const ids = this.recommended_list.map(p => p.id);
    this.saving = true;
    this.api.admin.setRecommendations(this.sourceId, { [recommendationField(type)]: ids }).subscribe({
      next: () => {
        this.saving = false;
        this.saveRecommendation.emit({ sourceId: this.sourceId, type, productIds: ids });
      },
      error: err => {
        this.saving = false;
        this.error = apiErrorMessage(err, 'Error saving recommendation');
      }
    });
  }

  onCancel(): void {
    this.closePopup.emit();
  }
}
