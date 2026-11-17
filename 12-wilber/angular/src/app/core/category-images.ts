import { Category } from '@shared/core/models';

/**
 * Tile images from the live wilber.co.in stone page, used until a category gets an image in admin
 * (an admin image always wins). Keyed by category slug; files are 600x600 JPGs.
 */
const CATEGORY_IMAGES: Record<string, string> = {
  ...Object.fromEntries(
    ['cementitious-tile-adhesive', 'epoxy-grout', 'sealers', 'cleaners', 'mastic', 'epoxy-products',
     'ager-polish', 'lapizo-bond', 'crystalizer', 'marble-densifier']
      .map(slug => [slug, `assets/images/categories/${slug}.jpg`])
  ),
  'industrial-solutions': 'assets/images/IndustrialSolutions.jpg',
  'stone-solutions': 'assets/images/stonesolution.jpg',
  // new file name = new URL: browsers had cached the old crystalizer.jpg for a year
  'crystalizer': 'assets/images/categories/crystalizer-v2.jpg'
};

export function categoryImage(c: Category): string {
  return c.image || c.bannerImage || CATEGORY_IMAGES[c.slug] || 'assets/images/logo.png';
}
