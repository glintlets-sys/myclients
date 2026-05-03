import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-blogs',
  templateUrl: './blogs.component.html',
  styleUrl: './blogs.component.scss'
})
export class BlogsComponent {

  blogType: string = "healthCare"; //"deepcleaning";//"cleanBrand"; //"cleanKitchen";

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    window.scrollTo(0, 0); // Scroll to the top of the page
    this.route.params.subscribe(params => {
      this.blogType = params['type'] || this.blogType; // Update blogType from route parameter
    });
  }

}
