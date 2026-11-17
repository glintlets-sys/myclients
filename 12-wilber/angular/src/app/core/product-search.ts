import { Category, ProductCard } from '@shared/core/models';

/**
 * Product search used by the header search box and the category-page search row (same results in both places).
 * Matches name, category, brand and product fields (code, tags, description, pack sizes, attributes) and price:
 * "under 2000" / "<2000", "above 500" / ">500", "1000-3000", or a plain amount (a pack priced within 10%).
 * Every word must match. Returns the matching cards (unsorted; callers order them).
 */
export function searchProducts(query: string, products: ProductCard[], categories: Category[]): ProductCard[] {
  const q = query.trim().toLowerCase().replace(/[₹,]/g, '').replace(/\brs\.?\s*/g, '');
  if (!q) return [];
  let min = 0, max = Number.MAX_SAFE_INTEGER;
  const text = q
    .replace(/(?:under|below|less than|upto|up to|<=?)\s*(\d+)/g, (_, n) => { max = +n; return ' '; })
    .replace(/(?:above|over|more than|from|>=?)\s*(\d+)/g, (_, n) => { min = +n; return ' '; })
    .replace(/(\d+)\s*(?:-|to)\s*(\d+)/g, (_, a, b) => { min = +a; max = +b; return ' '; });
  const words = text.split(/\s+/).filter(Boolean);
  const catName = categoryNames(categories);
  return products.filter(p => {
    const prices = p.variants.map(v => v.pricePaise / 100).filter(x => x > 0);
    if ((min > 0 || max < Number.MAX_SAFE_INTEGER) && !prices.some(x => x >= min && x <= max)) return false;
    const hay = [p.name, p.code, p.brand, p.shortDescription, p.badge, ...(p.tags ?? []),
      ...p.categoryIds.map(id => catName.get(id) ?? ''),
      ...p.variants.flatMap(v => [v.name, ...Object.values((v as { attributes?: Record<string, string> }).attributes ?? {})])]
      .join(' ').toLowerCase();
    return words.every(w => hay.includes(w) || (/^\d+$/.test(w) && prices.some(x => Math.abs(x - +w) <= +w * 0.1)));
  });
}

/** Category id → name, for showing "Sealers, Cleaners" under a search result. */
export function categoryNames(categories: Category[]): Map<string, string> {
  return new Map(categories.map(c => [c.id, c.name] as [string, string]));
}
