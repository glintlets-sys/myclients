/**
 * Title / meta-description rules shared by the storefront's SEO service and the admin snippet preview.
 *
 * KEEP IN STEP WITH glint-commerce-backend `app/.../seo/SeoRules.java`, which builds the pre-rendered pages at
 * publish time: same fallbacks, same separator, same clipping. A page must get the same title and description
 * whether a crawler reads the pre-rendered HTML or Angular sets them after in-app navigation.
 *
 * - Title: the item's `seoTitle` as written, else `"<name> | <store name>"`.
 * - Description: first non-empty of `seoDescription`, short description / excerpt, long description / body
 *   (HTML stripped, whitespace collapsed), clipped to 160 characters at a word boundary.
 */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;
export const SEO_SEPARATOR = ' | ';

/** Java's \s (ASCII whitespace only), so both sides collapse exactly the same characters. */
const SPACE = /[ \t\n\x0B\f\r]+/g;

export interface SeoTexted {
  seoTitle?: string | null;
  seoDescription?: string | null;
}

function trim(s: string | null | undefined): string {
  return (s ?? '').replace(SPACE, ' ').trim();
}

export function withStore(name: string | null | undefined, storeName: string | null | undefined): string {
  const n = trim(name), s = trim(storeName);
  if (!n) return s;
  if (!s || n.toLowerCase() === s.toLowerCase()) return n;
  return n + SEO_SEPARATOR + s;
}

/** HTML → plain text: tags removed, the common entities decoded, whitespace collapsed. */
export function plainText(html: string | null | undefined): string {
  if (html == null) return '';
  const s = html.replace(/<[^>]*>/g, ' ')
    .split('&nbsp;').join(' ').split('&lt;').join('<').split('&gt;').join('>').split('&quot;').join('"')
    .split('&#39;').join("'").split('&apos;').join("'").split('&amp;').join('&');
  return s.replace(SPACE, ' ').trim();
}

/** At most `max` characters, cut at a word boundary with an ellipsis. */
export function clip(text: string | null | undefined, max = SEO_DESCRIPTION_MAX): string {
  const s = trim(text);
  if (s.length <= max) return s;
  let cut = s.substring(0, max - 1);
  const space = cut.lastIndexOf(' ');
  if (space > Math.floor(max / 2)) cut = cut.substring(0, space);
  cut = cut.replace(/[ ,;:.\-–—]+$/, '');
  return cut + '…';
}

/** First non-empty candidate as plain text, clipped. */
export function seoDescription(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const t = plainText(c);
    if (t) return clip(t);
  }
  return '';
}

function explicitOr(explicit: string | null | undefined, name: string | null | undefined, storeName: string | null | undefined): string {
  const e = trim(explicit);
  return e ? e : withStore(name, storeName);
}

export function productSeoTitle(p: SeoTexted & { name?: string }, storeName?: string | null): string {
  return explicitOr(p.seoTitle, p.name, storeName);
}

export function productSeoDescription(p: SeoTexted & { shortDescription?: string | null; description?: string | null }): string {
  return seoDescription(p.seoDescription, p.shortDescription, p.description);
}

export function categorySeoTitle(c: SeoTexted & { name?: string }, storeName?: string | null): string {
  return explicitOr(c.seoTitle, c.name, storeName);
}

export function categorySeoDescription(c: SeoTexted & { name?: string; description?: string | null }, storeName?: string | null): string {
  const d = seoDescription(c.seoDescription, c.description);
  if (d) return d;
  const n = trim(c.name);
  if (!n) return '';
  return clip(trim(storeName) ? `Browse ${n} from ${trim(storeName)}.` : `Browse ${n}.`);
}

export function blogSeoTitle(b: SeoTexted & { title?: string }, storeName?: string | null): string {
  return explicitOr(b.seoTitle, b.title, storeName);
}

export function blogSeoDescription(b: SeoTexted & { excerpt?: string | null; content?: string | null }): string {
  return seoDescription(b.seoDescription, b.excerpt, b.content);
}

/** Listing page description when none is configured (same wording as the pre-rendered page). */
export function listingDescription(title: string, storeName: string, names: string[], limit?: number): string {
  const shown = limit ? names.slice(0, limit) : names;
  return clip(`${title} from ${storeName}` + (shown.length ? ': ' + shown.join(', ') + '.' : '.'));
}

/** Home description when none is configured. */
export function homeDescription(storeName: string, categoryNames: string[]): string {
  return clip(storeName + (categoryNames.length ? ': ' + categoryNames.slice(0, 6).join(', ') : '') + '.');
}
