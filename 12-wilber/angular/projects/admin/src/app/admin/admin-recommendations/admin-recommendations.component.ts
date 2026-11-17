import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../../core/admin-api';
import { Product } from '@shared/core/models';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { RECOMMENDATION_TYPES, RecommendationRow, RecommendationType, loadAllProducts, recommendationField } from './recommendations';
import { ManageRecommendationModalComponent } from './manage-recommendation-modal/manage-recommendation-modal.component';

@Component({
  selector: 'app-admin-recommendations',
  standalone: true,
  imports: [CommonModule, FormsModule, ManageRecommendationModalComponent],
  templateUrl: './admin-recommendations.component.html',
  styleUrl: './admin-recommendations.component.scss'
})
export class AdminRecommendationsComponent implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toaster = inject(ToasterService);

  products: Product[] = [];
  private byId = new Map<string, Product>();
  itemRecommendations: RecommendationRow[] = [];
  count = 0;
  isLoading = true;

  showRecommendationModal = false;
  selectedRecommendation: RecommendationRow | null = null;

  ngOnInit() {
    this.loadRecommendedItem();
  }

  async loadRecommendedItem(): Promise<void> {
    this.isLoading = true;
    try {
      this.products = await loadAllProducts(this.api);
      this.byId = new Map(this.products.map(p => [p.id, p]));
      const rows: RecommendationRow[] = [];
      for (const p of this.products) {
        if (p.relatedProductIds?.length) rows.push({ sourceId: p.id, type: 'RELATED', productIds: p.relatedProductIds });
        if (p.boughtTogetherIds?.length) rows.push({ sourceId: p.id, type: 'BOUGHT_TOGETHER', productIds: p.boughtTogetherIds });
      }
      this.itemRecommendations = rows;
      this.count = rows.length;
    } catch (err) {
      this.toaster.showToast(apiErrorMessage(err, 'Could not load products'), ToastType.Error, 4000);
    } finally {
      this.isLoading = false;
    }
  }

  getItemName(id: string): string {
    return this.byId.get(id)?.name || 'Unknown product';
  }

  getItemImg(id: string): string {
    const p = this.byId.get(id);
    return p?.thumbnail || p?.images?.[0] || 'assets/images/image_empty.jpg';
  }

  productCode(id: string): string {
    return this.byId.get(id)?.code || id;
  }

  typeLabel(type: RecommendationType): string {
    return RECOMMENDATION_TYPES.find(t => t.id === type)?.label ?? type;
  }

  addEditRecommendItem(row?: RecommendationRow) {
    this.selectedRecommendation = row ?? null;
    this.showRecommendationModal = true;
  }

  closeRecommendationModal(): void {
    this.showRecommendationModal = false;
    this.selectedRecommendation = null;
  }

  onSaveRecommendation(): void {
    this.closeRecommendationModal();
    this.toaster.showToast('Recommendations saved', ToastType.Success, 3000);
    this.loadRecommendedItem();
  }

  deleteRecommend(row: RecommendationRow) {
    if (!confirm(`Remove all ${this.typeLabel(row.type).toLowerCase()} from "${this.getItemName(row.sourceId)}"?`)) return;
    this.api.admin.setRecommendations(row.sourceId, { [recommendationField(row.type)]: [] }).subscribe({
      next: () => {
        this.toaster.showToast('Recommendation removed', ToastType.Success, 3000);
        this.loadRecommendedItem();
      },
      error: err => this.toaster.showToast(apiErrorMessage(err, 'Could not remove the recommendation'), ToastType.Error, 4000)
    });
  }
}
