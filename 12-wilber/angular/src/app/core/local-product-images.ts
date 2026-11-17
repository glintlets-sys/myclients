/**
 * Product photos in the catalog are hot-linked from the old site (https://www.wilber.co.in/assets/images/...), where
 * they are 5-30 MB camera originals. Web-sized copies (longest side 1200 px, same relative paths) are bundled in
 * src/assets/products/. This swaps any catalog image URL that has a bundled copy for the local file; URLs without a
 * copy (e.g. a photo added later in admin) are left untouched, so nothing can turn into a broken image.
 */
const OLD_SITE = /^https?:\/\/(?:www\.)?wilber\.co\.in\/assets\/images\/(.+)$/i;

/** Relative paths (under the old site's /assets/images/) that have a copy in src/assets/products/. */
const BUNDLED = new Set<string>([
  'Tile-Adhesive-Application-1.webp',
  'wilber_product/ager_polish/CERA_POLISH-450.jpg',
  'wilber_product/ager_polish/GRANITO_COLOUR_ENHANCER-400.jpg',
  'wilber_product/ager_polish/JET_NERO_BLACK-460.jpg',
  'wilber_product/ager_polish/SHINER-2000.jpg',
  'wilber_product/Cementitious_tile_adevisa/GEL-W 100.jpg',
  'wilber_product/Cementitious_tile_adevisa/GEN-666.jpg',
  'wilber_product/Cementitious_tile_adevisa/MGV-333.jpg',
  'wilber_product/Cementitious_tile_adevisa/REG-999.jpg',
  'wilber_product/cleaners/CEMENT CLEANER-208.jpg',
  'wilber_product/cleaners/EPOXY REMOVER-242.jpg',
  'wilber_product/cleaners/GRANITE RUST REMOVER-253.jpg',
  'wilber_product/cleaners/MARBLE CEMENT CLEANER-200.jpg',
  'wilber_product/cleaners/MARBLE RUST REMOVER-240.jpg',
  'wilber_product/cleaners/NEUTRAL CLEANER-230.jpg',
  'wilber_product/cleaners/PAINT REMOVER-250.jpg',
  'wilber_product/cleaners/UNIVERSAL CLEANER-248.jpg',
  'wilber_product/crystalizer/MARBLE_POLISH_POWDER.jpg',
  'wilber_product/epoxy_grout/EPOXY_GROUT_SET_WITH_GLOVES.jpg',
  'wilber_product/epoxy_products/EPOXY_ADHESIVE-152_PART-A.jpg',
  'wilber_product/lapizo_bond/LAPIZO_BOND_FAST_SET(SMALL).jpg',
  'wilber_product/lapizo_bond/LAPIZO_BOND_FAST_SET.jpg',
  'wilber_product/MARBLE EPOXY SET - 999.jpg',
  'wilber_product/marble_densifier/MARBLE DENSIFIER - PRO.jpg',
  'wilber_product/marble_densifier/MARBLE DESNIFIER REGULAR.jpg',
  'wilber_product/mastic/MASTIC LIQUID.jpg',
  'wilber_product/mastic/MASTIC SOLID.jpg',
  'wilber_product/sealers/NATURAL STONE BACK SEALER(S)-300.jpg',
  'wilber_product/sealers/NATURAL STONE BACK SEALER(W)-340.jpg',
  'wilber_product/sealers/OIL & WATER REPELLENT-320.jpg',
  'wilber_product/sealers/STAIN PROTECTOR-330 NANO.jpg',
  'wilber_product/sealers/WATER REPELLENT-310.jpg',
]);

/** The bundled copy's URL (relative, so it follows <base href>), or the original URL if there is no copy. */
export function localProductImage(url: string): string {
  const m = OLD_SITE.exec(url);
  if (!m) return url;
  let rel: string;
  try { rel = decodeURIComponent(m[1]); } catch { rel = m[1]; }
  return BUNDLED.has(rel) ? 'assets/products/' + encodeURI(rel) : url;
}

/** Deep copy of a catalog JSON value with every old-site image URL that has a bundled copy swapped for it. */
export function localizeImages<T>(value: T): T {
  if (typeof value === 'string') return localProductImage(value) as unknown as T;
  if (Array.isArray(value)) return value.map(v => localizeImages(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = localizeImages(v);
    return out as T;
  }
  return value;
}
