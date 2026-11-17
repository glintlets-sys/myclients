import { Component, OnInit, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { combineLatest } from 'rxjs';
import { CatalogStoreService } from '../core/catalog-store.service';
import { SeoService } from '../core/seo.service';
import { Blog } from '@shared/core/models';
import { ApiService } from '@shared/core/api.service';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from '../shared/header/header.component';
import { FooterComponent } from '../shared/footer/footer.component';

/** Blog card view model in the shape the approved template renders. */
interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date?: string;
  category: string;
  image: string;
  readTime: string;
}

@Component({
  selector: 'app-blogs',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, HeaderComponent, FooterComponent],
  templateUrl: './blogs.component.html',
  styleUrl: './blogs.component.scss'
})
export class BlogsComponent implements OnInit, AfterViewInit {

  private readonly catalog = inject(CatalogStoreService);
  private readonly seo = inject(SeoService);
  private readonly route = inject(ActivatedRoute);

  private readonly api = inject(ApiService);

  blogPosts: BlogPost[] = [];
  newsletterEmail = '';

  ngOnInit(): void {
    combineLatest([this.catalog.blogs(), this.route.queryParamMap]).subscribe({
      next: ([blogs, params]) => {
        this.seo.blogListing(blogs);
        const category = params.get('category');
        this.blogPosts = blogs
          .filter(b => b.published !== false && (!category || b.category === category))
          .map((b: Blog) => ({
            slug: b.slug,
            title: b.title,
            excerpt: b.excerpt ?? '',
            date: b.publishDate,
            category: b.category ?? '',
            image: b.image ?? '',
            readTime: b.readTime ?? ''
          }));
      },
      error: err => console.error('Could not load blogs', err)
    });
  }

  ngAfterViewInit(): void {
    this.initializeScrollEffects();
  }

  /** Newsletter sign-ups are recorded as an enquiry (the API has no separate newsletter endpoint). */
  onNewsletterSubmit(): void {
    const email = this.newsletterEmail.trim();
    if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(email)) {
      alert('Please enter a valid email address.');
      return;
    }
    this.api.enquiry({ name: email, email, subject: 'Newsletter subscription', message: 'Please subscribe me to the newsletter.' }).subscribe({
      next: () => {
        this.newsletterEmail = '';
        alert('Thank you for subscribing!');
      },
      error: err => alert(apiErrorMessage(err))
    });
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
