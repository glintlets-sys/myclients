import { Component, AfterViewInit, Inject, PLATFORM_ID, OnInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import Swiper from 'swiper';
import Element from "swiper"
import { register } from 'swiper/element/bundle';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements AfterViewInit, OnInit {

  solutions: any[] = [];
  industries: any[] = [];
  constructor(@Inject(PLATFORM_ID) private platformId: Object,
    private dataService: DataService) { }

  blogs: any[] = [
      {
        "tag": "liquidDetergent",
        "title": "Liquid Detergent Manufacturers in India: A Complete Guide for Businesses",
        "image": "assets/image/CommercialLaundries.jpg",
        "content": "Liquid detergents have become an essential part of modern cleaning across industries such as hospitality, healthcare, manufacturing, and commercial laundry. Their superior cleaning ability, easy application, and adaptability make them a preferred choice over traditional powders. For businesses, partnering with the right liquid detergent manufacturer in India is not just about sourcing a product—it’s about ensuring quality, reliability, and operational efficiency."
      },
      {
        "tag": "cleanKitchen",
        "title": "Clean Kitchen, Safe Kitchen: Essential Tips for a Healthy Cooking Spaces",
        "image": "assets/image/clean-kitchen.jpg",
        "content": "Consistency is key to a clean kitchen. Establish a cleaning schedule that covers daily tasks (like wiping down countertops and cleaning dishes) alongside weekly deep-cleaning tasks, such as scrubbing appliances and mopping floors. Breaking down cleaning tasks into daily, weekly, and monthly routines keeps the workload manageable and ensures a consistently sanitary space."
      },
      {
        "tag": "cleanBrand",
        "title": "How Cleanliness Influences Brand Image and Customer Trust",
        "image": "assets/image/branding.jpg",
        "content": "Maintaining cleanliness in a business environment is crucial not just for health, but also for fostering a positive brand image. Customers increasingly associate cleanliness with professionalism and trustworthiness, making it a significant factor in their purchasing decisions."
      },
      {
        "tag": "deepcleaning",
        "title": "Deep Cleaning Reset Protocols for Commercial Establishments",
        "image": "assets/image/deep-cleaning.jpg",
        "content": "In the wake of increasing health concerns, implementing effective deep cleaning protocols is essential for commercial establishments. These protocols not only enhance hygiene but also build trust among customers and staff."
      },
      {
        "tag": "healthCare",
        "title": "Excellence in Healthcare: The Indispensable Role of Cleaning Protocols",
        "image": "assets/image/health-care2.jpg",
        "content": "In healthcare settings, the importance of cleanliness cannot be overstated. Effective cleaning protocols are crucial for protecting patient health and ensuring high-quality care. By establishing rigorous cleaning standards, healthcare facilities can create safer environments, significantly reduce infection risks, and enhance patient and staff confidence."
      }
    ]
    


  ngOnInit(): void {
    this.dataService.getSolutions().subscribe(data => {
      this.solutions = data;
    });
    this.dataService.getIndustries().subscribe(data => {
      this.industries = data;
    });
  }

  ngAfterViewInit(): void {

    setTimeout(() => {

      this.initializeSwiper();
    }, 1000);



  }

  initializeSwiper() {
    if (isPlatformBrowser(this.platformId)) {

      register();

      const myCarousel = document.querySelector('#carouselExampleFade1');
      if (myCarousel) {
        const carousel = new (window as any).bootstrap.Carousel(myCarousel, {
          interval: 2000,
        });
      }

      let swiper = new Swiper(".mySwiper", {
        spaceBetween: 10,
        // slidesPerView: 4,
        freeMode: true,
        watchSlidesProgress: true,
        grabCursor: true,
        navigation: {
          nextEl: ".swiper-button-next",
          prevEl: ".swiper-button-prev",
        },
        breakpoints: {
          300: {
            slidesPerView: 1,
          },
          768: {
            slidesPerView: 3,
          },
          1200: {
            slidesPerView: 4,
          },
          2000: {
            slidesPerView: 4,
          },
        },
      });
      let swiper2 = new Swiper(".mySwiper2", {
        spaceBetween: 10,

        autoplay: {
          delay: 10000,
          pauseOnMouseEnter: true,
          // disableOnInteraction: true,
        },
        loop: true,
        grabCursor: true,
        thumbs: {
          swiper: swiper,
        },
        breakpoints: {
          300: {
            slidesPerView: 1,
          },
          768: {
            slidesPerView: 1,
          },
          991: {
            slidesPerView: 1,
          },
          2000: {
            slidesPerView: 1,
          },
        },
      });
    }
  }
}
