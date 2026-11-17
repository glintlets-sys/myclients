import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../shared/header/header.component';
import { FooterComponent } from '../shared/footer/footer.component';
import { AdPopupComponent } from '../shared/ad-popup/ad-popup.component';
import { combineLatest } from 'rxjs';
import { CatalogStoreService } from '../core/catalog-store.service';
import { SeoService } from '../core/seo.service';
import { ApiService } from '@shared/core/api.service';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { PublishedBanner, Category, ProductCard } from '@shared/core/models';

/** One banner slide of the home hero carousel. */
interface HeroSlide {
  image: string;
  imageMobile?: string;
  alt: string;
  title?: string;
  subtitle?: string;
  /** In-app link (product / category / site path) or an external URL. */
  route?: string;
  href?: string;
}

/** Shown until banners are published from admin (the images that were hard-coded here before). */
const BUILT_IN_HERO: HeroSlide[] = [
  { image: 'assets/images/banner1.png', title: 'Durability That Lasts', subtitle: 'High-performance products for long-lasting results',
    alt: 'Adesiva Epoxy Grout System by Wilber - suits all climates, water and stain proof, 30+ colour shades' },
  { image: 'assets/images/banner2.png', title: 'Seamless Application', subtitle: 'Perfect for walls and floors',
    alt: 'Adesiva Mastic by Wilber - joint and filling adhesive for marble and natural stone, solid and liquid' },
  { image: 'assets/images/banner3.png', title: 'High-Strength Adhesion', subtitle: 'For perfect tiling results every time',
    alt: 'Adesiva Marble Epoxy 999 by Wilber - crystal-clear, non-yellowing epoxy for marble and granite' },
];

function toSlide(b: PublishedBanner): HeroSlide {
  const target = b.linkTarget ?? '';
  const route = b.linkType === 'product' && b.linkSlug ? `/product/${b.linkSlug}`
    : b.linkType === 'category' && b.linkSlug ? `/category/${b.linkSlug}`
    : b.linkType === 'url' && target.startsWith('/') ? target : undefined;
  return {
    image: b.imageDesktop,
    imageMobile: b.imageMobile || undefined,
    alt: b.altText || b.title,
    title: b.title,
    subtitle: b.subtitle,
    route,
    href: b.linkType === 'url' && /^https?:\/\//i.test(target) ? target : undefined,
  };
}

declare var Swiper: any;
declare var bootstrap: any;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, FooterComponent, AdPopupComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  private readonly catalog = inject(CatalogStoreService);
  private readonly seo = inject(SeoService);
  private readonly api = inject(ApiService);

  /** Hero slides after the Industrial/Stone split slide: admin "Home – hero slider" banners, else the built-in ones. */
  heroBanners: HeroSlide[] = BUILT_IN_HERO;

  /** "Our Products" promo tiles — the category's own image (admin → Categories), else the built-in photo. */
  industrialImg = 'assets/images/IndustrialSolutions.jpg';
  stoneImg = 'assets/images/stonesolution.jpg';
  /** About photo + bottom CTA-strip photo — admin → Marketing → Banners (home-feature / home-strip), else built-in. */
  aboutImg = 'assets/images/aboutusimage.webp';
  ctaImg = 'assets/images/resource/cta-1.jpg';

  /** Marketing categories surfaced on the landing (admin → category → Marketing toggle), in sort order. */
  marketingCats: { cat: Category; products: ProductCard[] }[] = [];

  message = { name: '', phone: '', email: '', subject: '', text: '' };
  sending = false;

  sendMessage(): void {
    const m = this.message;
    if (!m.name.trim() || !m.email.trim()) {
      alert('Please enter your name and email address.');
      return;
    }
    // Accept "97315 25004", "+91 9731525004" etc. — keep the last 10 digits
    const phone = m.phone.replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (this.sending) return;
    this.sending = true;
    this.api.enquiry({
      name: m.name.trim(),
      phone,
      email: m.email.trim(),
      subject: m.subject.trim() || 'Website enquiry',
      message: m.text.trim() || m.subject.trim() || 'Website enquiry'
    }).subscribe({
      next: () => {
        this.sending = false;
        alert('Thank you for your message! We will get back to you soon.');
        this.message = { name: '', phone: '', email: '', subject: '', text: '' };
      },
      error: err => {
        this.sending = false;
        alert(apiErrorMessage(err, 'There was an error submitting your message. Please try again later.'));
      }
    });
  }

  ngOnInit() {
    combineLatest([this.catalog.categories(), this.catalog.products()]).subscribe({
      next: ([categories, products]) => {
        this.seo.home(categories, products);
        // "Our Products" tiles follow the category's own image set in admin → Categories.
        const ind = categories.find(c => c.slug === 'industrial-solutions');
        const stn = categories.find(c => c.slug === 'stone-solutions');
        if (ind?.image) this.industrialImg = ind.image;
        if (stn?.image) this.stoneImg = stn.image;
        // Marketing categories: shown on the landing in admin sort order, each in its chosen mode.
        this.marketingCats = categories
          .filter(c => c.marketing && c.active !== false)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map(cat => ({ cat, products: products.filter(p => (p.categoryIds ?? []).includes(cat.id)).slice(0, 4) }));
      },
      error: () => this.seo.home([], [])
    });
    this.catalog.banners('home-hero').subscribe(bs => { if (bs.length) this.heroBanners = bs.map(toSlide); });
    // About photo + bottom CTA-strip photo: admin-managed via Marketing → Banners, else the built-in image.
    this.catalog.banners('home-feature').subscribe(bs => { if (bs[0]?.imageDesktop) this.aboutImg = bs[0].imageDesktop; });
    this.catalog.banners('home-strip').subscribe(bs => { if (bs[0]?.imageDesktop) this.ctaImg = bs[0].imageDesktop; });
    this.initializeSliders();
    this.initializeCarousel();
    this.initializeBackToTop();
  }

  private initializeSliders() {
    // Initialize review slider
    const reviewSlider = new Swiper('.review-slider', {
      slidesPerView: 1,
      spaceBetween: 20,
      grabCursor: true,
      autoplay: {
        delay: 2500,
        disableOnInteraction: false,
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
          slidesPerView: 1,
          spaceBetween: 20,
        },
        1024: {
          slidesPerView: 2,
          spaceBetween: 20,
        },
      }
    });

    // Initialize blog slider
    const blogSlider = new Swiper('.blog-slider', {
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

  private initializeCarousel() {
    const heroCarousel = document.getElementById('heroCarousel');
    if (heroCarousel) {
      const carousel = new bootstrap.Carousel(heroCarousel, {
        interval: 6000,
        pause: 'hover'
      });
    }
  }

  private initializeBackToTop() {
    const backToTop = document.querySelector('.back-to-top');
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
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      });
    }
  }
}
