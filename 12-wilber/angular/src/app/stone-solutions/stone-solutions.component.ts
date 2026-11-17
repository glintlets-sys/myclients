import { Component, OnInit, AfterViewInit, inject } from '@angular/core';
import { CatalogStoreService } from '../core/catalog-store.service';
import { SeoService, categoryPath } from '../core/seo.service';
import { categoryImage } from '../core/category-images';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Category } from '@shared/core/models';

interface Tile { title: string; image: string; link: string; }
import { HeaderComponent } from '../shared/header/header.component';
import { FooterComponent } from '../shared/footer/footer.component';

@Component({
  selector: 'app-stone-solutions',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent, FooterComponent],
  templateUrl: './stone-solutions.component.html',
  styleUrl: './stone-solutions.component.scss'
})
export class StoneSolutionsComponent implements OnInit, AfterViewInit {

  private readonly catalog = inject(CatalogStoreService);
  private readonly seo = inject(SeoService);

  private readonly route = inject(ActivatedRoute);

  /** Category tiles, from the published catalog (same shape the template already renders). */
  stoneProducts: Tile[] = [];
  /** Top-level groups (e.g. Industrial Solutions, Stone Solutions) with their sub-category tiles.
   *  Empty when no category has sub-categories: the page then shows the flat list as before. */
  groups: { id: string; slug: string; title: string; description?: string; tiles: Tile[] }[] = [];

  ngOnInit(): void {
    this.catalog.categories().subscribe({
      next: categories => {
        this.seo.catalogListing(categories);
        const active = categories.filter(c => c.active !== false).sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
        const tile = (c: Category): Tile => ({
          title: c.name,
          image: categoryImage(c),
          link: categoryPath(c)
        });
        const roots = active.filter(c => !c.parentId);
        const grouped = roots
          .map(r => ({ id: r.id, slug: r.slug, title: r.name, description: r.description, tiles: active.filter(c => c.parentId === r.id).map(tile) }));
        // Once any top-level category has sub-categories, every top-level category with no products of its own becomes a section
        // (an empty one, e.g. Industrial Solutions today, shows "coming soon"). Top-level categories that hold products stay tiles.
        const anyGrouped = grouped.some(g => g.tiles.length);
        const holdsProducts = (id: string) => (roots.find(r => r.id === id)?.productCount ?? 0) > 0;
        this.groups = anyGrouped ? grouped.filter(g => g.tiles.length || !holdsProducts(g.id)) : [];
        this.stoneProducts = roots.filter(r => !this.groups.some(g => g.id === r.id)).map(tile);
        this.scrollToGroup(this.route.snapshot.fragment);
      },
      error: err => console.error('Could not load categories', err)
    });
  }

  /** /stone-solutions#industrial-solutions → jump to that group (also when the menu is used while already on this page). */
  private scrollToGroup(frag: string | null): void {
    if (frag) setTimeout(() => document.getElementById(frag)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  ngAfterViewInit(): void {
    this.route.fragment.subscribe(f => this.scrollToGroup(f));
    this.initializeScrollEffects();
  }

  private initializeScrollEffects(): void {
    // Back to top button functionality
    const backToTop = document.getElementById('backToTop');
    if (backToTop) {
      window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
          backToTop.classList.add('show');
        } else {
          backToTop.classList.remove('show');
        }
      });

      backToTop.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Header scroll effect
    const header = document.querySelector('.main-header');
    if (header) {
      window.addEventListener('scroll', () => {
        if (window.pageYOffset > 100) {
          (header as HTMLElement).style.padding = '10px 0';
          (header as HTMLElement).style.boxShadow = '0 2px 20px rgba(0,0,0,0.1)';
        } else {
          (header as HTMLElement).style.padding = '15px 0';
          (header as HTMLElement).style.boxShadow = '0 2px 15px rgba(0,0,0,0.05)';
        }
      });
    }
  }
} 