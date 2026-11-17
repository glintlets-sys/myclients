import { AfterViewInit, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { HeaderComponent } from '../shared/header/header.component';
import { FooterComponent } from '../shared/footer/footer.component';
import { CatalogStoreService } from '../core/catalog-store.service';
import { SeoService } from '../core/seo.service';
import { Blog } from '@shared/core/models';

/** Blog view model in the shape the approved template renders. */
interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  date?: string;
  category: string;
  image: string;
  readTime: string;
  tags: string[];
}

function toPost(b: Blog): BlogPost {
  return {
    slug: b.slug,
    title: b.title,
    excerpt: b.excerpt ?? '',
    content: b.content ?? '',
    author: b.author ?? 'Wilber Technical Team',
    date: b.publishDate,
    category: b.category ?? '',
    image: b.image ?? '',
    readTime: b.readTime ?? '',
    tags: b.tags ?? []
  };
}

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, HeaderComponent, FooterComponent],
  templateUrl: './blog-detail.component.html',
  styleUrls: ['./blog-detail.component.scss']
})
export class BlogDetailComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private seo = inject(SeoService);
  private catalog = inject(CatalogStoreService);

  blogPost: BlogPost | null = null;
  relatedPosts: BlogPost[] = [];
  blogCategories: { name: string; count: number }[] = [];
  loading = true;

  ngOnInit() {
    this.route.paramMap.pipe(
      map(params => params.get('slug') ?? ''),
      switchMap(slug => {
        this.loading = true;
        return combineLatest([
          this.catalog.blog(slug).pipe(catchError(() => of(null))),
          this.catalog.blogs().pipe(catchError(() => of([] as Blog[])))
        ]);
      })
    ).subscribe(([blog, all]) => {
      this.loading = false;
      if (!blog) {
        this.router.navigate(['/blogs']);
        return;
      }
      // Content is rendered through [innerHTML], which Angular sanitizes.
      this.blogPost = toPost(blog);
      const others = all.filter(b => b.slug !== blog.slug && b.published !== false);
      const sameCategory = others.filter(b => b.category && b.category === blog.category);
      this.relatedPosts = [...sameCategory, ...others.filter(b => !sameCategory.includes(b))].slice(0, 3).map(toPost);
      const counts = new Map<string, number>();
      all.filter(b => b.published !== false && b.category).forEach(b => counts.set(b.category!, (counts.get(b.category!) ?? 0) + 1));
      this.blogCategories = [...counts].map(([name, count]) => ({ name, count }));
      this.seo.blog(blog);

      setTimeout(() => this.initializeSwiper(), 0);
    });
  }

  ngAfterViewInit(): void {
    this.initializeBackToTop();
  }

  private initializeSwiper(): void {
    // Check if Swiper is available
    if (typeof (window as any).Swiper !== 'undefined') {
      const blogSlider = new (window as any).Swiper('.blog-slider', {
        slidesPerView: 1,
        spaceBetween: 20,
        grabCursor: true,
        autoplay: {
          delay: 2500,
          disableOnInteraction: true,
          pauseOnMouseEnter: true,
        },
        pagination: {
          el: '.swiper-pagination',
          clickable: true,
        },
        navigation: {
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev',
        },
        breakpoints: {
          640: {
            slidesPerView: 1,
            spaceBetween: 20,
          },
          768: {
            slidesPerView: 2,
            spaceBetween: 20,
          },
          1024: {
            slidesPerView: 3,
            spaceBetween: 20,
          },
        }
      });
    }
  }

  private initializeBackToTop(): void {
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
  }
} 