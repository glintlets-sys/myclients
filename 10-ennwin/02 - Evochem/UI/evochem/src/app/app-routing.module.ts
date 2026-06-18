import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { CategoryComponent } from './components/category/category.component';
import { ProductComponent } from './components/product/product.component';
import { ContactusComponent } from './components/contactus/contactus.component';
import { SolutionsComponent } from './components/solutions/solutions.component';
import { BlogsComponent } from './components/blogs/blogs.component';

const routes: Routes = [
  {
    path: '', component: HomeComponent, pathMatch: 'full',
    data: {
      title: 'Industrial Cleaning Chemical Manufacturer India | Evochem',
      description: 'Evochem — trusted manufacturer of industrial & hygiene cleaning chemicals in India. ISO-compliant, bulk supply, pan-India delivery. Get a free quote today.'
    }
  },
  { path: 'home', redirectTo: '', pathMatch: 'full' },
  {
    path: 'categories', component: CategoryComponent,
    data: {
      title: 'Cleaning Chemicals by Industry | Evochem India',
      description: 'Explore Evochem industrial cleaning chemicals organised by industry — hotels, hospitals, factories and food processing. Bulk supply across India.'
    }
  },
  {
    path: 'categories/:id', component: CategoryComponent,
    data: {
      title: 'Industrial Cleaning Chemicals | Evochem India',
      description: 'High-quality cleaning chemicals from Evochem, a trusted manufacturer and bulk supplier in India.'
    }
  },
  {
    path: 'product/:productId', component: ProductComponent, runGuardsAndResolvers: 'always',
    data: {
      title: 'Cleaning Chemical Product | Evochem India',
      description: 'Product details, specifications and enquiry for Evochem industrial and hygiene cleaning chemicals. Bulk supply across India.'
    }
  },
  {
    path: 'contactus', component: ContactusComponent,
    data: {
      title: 'Contact Evochem | Cleaning Chemical Manufacturer India',
      description: 'Contact Evochem for bulk industrial and hygiene cleaning chemical supply across India. Get a free quote — fast response from our team.'
    }
  },
  {
    path: 'solutions', component: SolutionsComponent,
    data: {
      title: 'Cleaning Solutions by Area | Evochem India',
      description: 'Evochem cleaning solutions tailored by cleaning area and application. Industrial-grade, ISO-compliant chemicals supplied in bulk across India.'
    }
  },
  {
    path: 'solutions/:solutionType', component: SolutionsComponent,
    data: {
      title: 'Cleaning Solutions | Evochem India',
      description: 'Targeted cleaning solutions from Evochem — industrial and hygiene chemicals for every surface and application. Bulk supply across India.'
    }
  },
  {
    path: 'blogs/:type', component: BlogsComponent,
    data: {
      title: 'Cleaning Tips & Insights | Evochem India',
      description: 'Expert cleaning tips, hygiene insights and industry guidance from Evochem, a leading cleaning chemical manufacturer in India.'
    }
  },
  { path: '**', redirectTo: '' } // Wildcard route for 404
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { onSameUrlNavigation: 'reload' }) ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
