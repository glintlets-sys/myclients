import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/admin-api';
import { Product } from '@shared/core/models';

/** RELATED → product.relatedProductIds ("You may also like"); BOUGHT_TOGETHER → product.boughtTogetherIds. */
export type RecommendationType = 'RELATED' | 'BOUGHT_TOGETHER';

export const RECOMMENDATION_TYPES: { id: RecommendationType; label: string }[] = [
  { id: 'RELATED', label: 'Related products' },
  { id: 'BOUGHT_TOGETHER', label: 'Frequently bought together' },
];

/** One row of the table: a source product and one of its recommendation lists. */
export interface RecommendationRow {
  sourceId: string;
  type: RecommendationType;
  productIds: string[];
}

export function recommendationField(type: RecommendationType): 'relatedProductIds' | 'boughtTogetherIds' {
  return type === 'RELATED' ? 'relatedProductIds' : 'boughtTogetherIds';
}

/** Loads every product (incl. inactive) across pages. */
export async function loadAllProducts(api: AdminApi): Promise<Product[]> {
  const all: Product[] = [];
  for (let page = 0; ; page++) {
    const res = await firstValueFrom(api.admin.products({ page, size: 200 }));
    all.push(...res.items);
    if (!res.items.length || all.length >= res.total) return all;
  }
}
