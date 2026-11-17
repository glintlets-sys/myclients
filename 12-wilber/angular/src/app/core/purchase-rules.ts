import { PriceSlab } from '@shared/core/models';

/** Cart line cap (the API rejects more than this per line). */
export const MAX_LINE_QTY = 99;

interface HasRules {
  pricePaise: number;
  priceSlabs?: PriceSlab[];
  minQty?: number;
  maxQty?: number;
  minOrderQty?: number | null;
  maxOrderQty?: number | null;
}

/**
 * Display-side helpers for quantity slabs and order limits. The server is the source of truth: these only drive
 * steppers and price hints; every quote/checkout re-prices on the server.
 */
export function qtyLimits(v: HasRules | null | undefined, product?: { minOrderQty?: number | null; maxOrderQty?: number | null }) {
  const min = v?.minQty ?? v?.minOrderQty ?? product?.minOrderQty ?? 1;
  const max = v?.maxQty ?? v?.maxOrderQty ?? product?.maxOrderQty ?? MAX_LINE_QTY;
  return { min: Math.max(1, min || 1), max: Math.min(MAX_LINE_QTY, Math.max(1, max || MAX_LINE_QTY)) };
}

export function sortedSlabs(v: HasRules | null | undefined): PriceSlab[] {
  return [...(v?.priceSlabs ?? [])].sort((a, b) => a.minQty - b.minQty);
}

/** The slab for this quantity, or null. */
export function slabFor(v: HasRules | null | undefined, qty: number): PriceSlab | null {
  let best: PriceSlab | null = null;
  for (const s of sortedSlabs(v)) if (s.minQty <= qty) best = s;
  return best;
}

export function unitPriceFor(v: HasRules | null | undefined, qty: number): number {
  return slabFor(v, qty)?.unitPricePaise ?? v?.pricePaise ?? 0;
}

export function clampQty(qty: number, limits: { min: number; max: number }): number {
  const n = Math.floor(Number(qty) || 0);
  return Math.min(limits.max, Math.max(limits.min, n));
}
