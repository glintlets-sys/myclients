import { Component, AfterViewInit, Inject, PLATFORM_ID, OnInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import Element from "swiper"
import { register } from 'swiper/element/bundle';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';

import { DataService } from '../../services/data.service';
import Swiper from 'swiper';


@Component({
  selector: 'app-product',
  templateUrl: './product.component.html',
  styleUrl: './product.component.scss'
})
export class ProductComponent implements OnInit, AfterViewInit {

  productId: any;

  industries: any[] = [];
  solutions: any[] = [];
  solutionsTypes: any[] = [];

  selectedIndustry: any;
  selectedCategory: any;
  selectedSolution: any;
  selectedProduct: any;
  relatedproducts: any;
  selectedSolutionType: any;

  constructor(private route: ActivatedRoute, private dataService: DataService, @Inject(PLATFORM_ID) private platformId: Object, private router: Router) {

    this.productId = this.route.snapshot.paramMap.get('productId');
    this.industryId = this.route.snapshot.paramMap.get('solution');
    this.solutionType = this.route.snapshot.paramMap.get('solutionType');

   // console.log("print code: " + this.industryId)
  /*  this.dataService.getIndustries().subscribe(val=>{
      this.industries = val;
      this.initializeProduct();
    })*/

    this.dataService.getSolutions().subscribe(val =>{
      this.solutions = val;
      this.initializeProduct();
      this.dataService.getIndustries().subscribe(val => {
        this.industries = val;
        this.initializeCurrentIndustry();
      })
      this.dataService.getSolutionTypes().subscribe(val=>{
        this.solutionsTypes = val;
        this.initializeCurrentSolutionType();
      })
    })
    

  }



  ngAfterViewInit(): void {
   
    setTimeout(() => {

      this.initializeSwiper();
    }, 100);

  }

  industryId: string | null = null;
  solutionType: string | null = null;


  initializeCurrentIndustry()
  {
    if(this.industryId) {

      this.industries.forEach(industry =>{
        if(industry.id == Number(this.industryId)) {
          this.selectedIndustry = industry;
        }
      })

    }
  }

  initializeCurrentSolutionType()
  {
    if(this.solutionType) {
      this.solutionsTypes.forEach(solutionType => {
        if(solutionType.id == this.solutionType){
          this.selectedSolutionType = solutionType;
        }
      })
    }
  }

  ngOnInit(): void {
    
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        // This will refresh the component
        //window.location.reload();
        window.scrollTo(0, 0); // Scroll to the top of the page
      }
    });

    this.route.params.subscribe(params =>{
      this.productId = this.route.snapshot.paramMap.get('productId');
      this.industryId = this.route.snapshot.paramMap.get('solution');
      this.solutionType = this.route.snapshot.paramMap.get('solutionType');
      this.initializeProduct();
    })

    
    console.log("current product id: " + this.productId);
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

     let swiper = new Swiper(".relatedswiper", {
        autoplay: {
            delay: 1500,
            pauseOnMouseEnter: true,
            // disableOnInteraction: true,
        },
        //loop: true,
        grabCursor: true,
     
        
        spaceBetween: 10,
  
        navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
        },
        breakpoints: {
            300: {
                slidesPerView: 1,
            },
            500: {
                slidesPerView: 2,
            },
            768: {
                slidesPerView: 2,
            },
            993: {
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
     
    }
  }


  formatCode(code: string): string {
    return code.replace(/\s+/g, '-').toLowerCase(); // Replace spaces with hyphens and convert to lowercase
  }

  getSolution(id: any)
  {
    let solution = this.solutions.find(solution=> solution.id+"" === id+"");
    //console.log("found solution " + JSON.stringify(solution));
    return solution;
  }

  initializeProduct()
  {

    if(this.solutions.length ==0) {
      return;
    }

    if (this.productId) {
      console.log("product id: " + this.productId);
          for (let solution of this.solutions) {
            const product = solution.products.find((p: any) =>
               this.formatCode(p.code) === this.productId);
            console.log("found product" + JSON.stringify(product))
            if (product) {
              this.selectedSolution =solution;
              this.relatedproducts = this.selectedSolution.products;
              this.selectedProduct = product;
              this.buildWhatsAppLink();
              return;
            }
          }
    }
  }


  phoneNumber: string = '917483837722';
  emailAddress: string = 'info@ennwin.in';
  whatsappURL: string = '';
  emailURL: string = '';
  telURL: string = '';

  buildWhatsAppLink(): void {
    const baseMessage = `Hello, I'm interested in your ${this.selectedProduct?.code} (${this.selectedProduct?.title}). Can you provide more details?`;
    const encodedMessage = encodeURIComponent(baseMessage);
    this.whatsappURL = `https://wa.me/${this.phoneNumber}?text=${encodedMessage}`;

    const subject = encodeURIComponent(`Enquiry: ${this.selectedProduct?.code} - ${this.selectedProduct?.title}`);
    const body = encodeURIComponent(
      `Hello Evochem team,\n\nI'd like more information about ${this.selectedProduct?.code} (${this.selectedProduct?.title}).\n\nDetails I'd like to know:\n- Pricing and MOQ\n- Available packaging sizes\n- Lead time for delivery\n- MSDS / SDS document\n\nThank you.`
    );
    this.emailURL = `mailto:${this.emailAddress}?subject=${subject}&body=${body}`;
    this.telURL = `tel:+${this.phoneNumber}`;
  }

  /** MSDS / SDS download URL — placeholder route, swap to real PDF when available */
  get msdsURL(): string {
    return this.emailURL; // Until real MSDS PDFs are hosted, route the request through email.
  }

}
