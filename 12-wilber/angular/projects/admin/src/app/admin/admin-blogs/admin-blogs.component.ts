import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToasterService } from '@shared/ui/toaster.service';
import { ToastType } from '@shared/ui/toaster';
import { AdminApi } from '../../core/admin-api';
import { apiErrorMessage } from '@shared/core/api.interceptor';
import { Blog } from '@shared/core/models';
import { SeoFieldsComponent } from '../admin-seo/seo-fields.component';

/** Form model: Blog plus the read time as a number of minutes. */
interface BlogForm extends Blog {
  readMinutes: number | null;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function emptyBlog(): BlogForm {
  return {
    slug: '',
    title: '',
    excerpt: '',
    content: '',
    image: '',
    author: '',
    category: '',
    tags: [],
    readTime: '',
    readMinutes: null,
    externalUrl: '',
    publishDate: new Date().toISOString().split('T')[0],
    published: true,
    seoTitle: '',
    seoDescription: '',
  };
}

@Component({
  selector: 'app-admin-blogs',
  standalone: true,
  imports: [CommonModule, FormsModule, SeoFieldsComponent],
  templateUrl: './admin-blogs.component.html',
  styleUrls: ['./admin-blogs.component.scss']
})
export class AdminBlogsComponent implements OnInit {
  private readonly api = inject(AdminApi);
  readonly slugPreview = (s: string | undefined) => slugify(s ?? '');
  private readonly toasterService = inject(ToasterService);

  public blogs: Blog[] = [];
  public filteredBlogs: Blog[] = [];
  public searchBlog = '';
  public loading = false;
  public currentPage = 1;
  public itemsPerPage = 10;
  public totalItems = 0;
  public Math = Math;

  // Add/Edit Blog Modal
  public showBlogModal = false;
  public editingBlog: Blog | null = null;
  public newBlog: BlogForm = emptyBlog();
  public saving = false;
  public uploading = false;
  public tagInput = '';
  public readonly categories = ['Industrial Solutions', 'Stone Care', 'Flooring', 'Cleaning', 'Maintenance'];

  ngOnInit(): void {
    this.loadBlogs();
  }

  public loadBlogs(): void {
    this.loading = true;
    this.api.admin.blogs().subscribe({
      next: res => {
        this.blogs = res.blogs ?? [];
        this.filterData(false);
        this.loading = false;
      },
      error: err => {
        this.toasterService.showToast(apiErrorMessage(err, 'Failed to load blogs'), ToastType.Error);
        this.loading = false;
        this.blogs = [];
        this.filterData();
      }
    });
  }

  public filterData(resetPage = true): void {
    const q = this.searchBlog.trim().toLowerCase();
    this.filteredBlogs = !q ? [...this.blogs] : this.blogs.filter(b =>
      b.title?.toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q) ||
      b.category?.toLowerCase().includes(q));
    this.totalItems = this.filteredBlogs.length;
    if (resetPage || this.currentPage > this.totalPages) this.currentPage = 1;
  }

  public get paginatedBlogs(): Blog[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredBlogs.slice(start, start + this.itemsPerPage);
  }

  public get totalPages(): number {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  public onPageChange(page: number): void {
    this.currentPage = page;
  }

  /** Category options, including any custom category already used by a blog. */
  public get categoryOptions(): string[] {
    const used = this.blogs.map(b => b.category).filter((c): c is string => !!c);
    const current = this.newBlog.category ? [this.newBlog.category] : [];
    return [...new Set([...this.categories, ...used, ...current])];
  }

  public addBlog(): void {
    this.editingBlog = null;
    this.newBlog = emptyBlog();
    this.tagInput = '';
    this.showBlogModal = true;
  }

  public editBlog(blog: Blog): void {
    this.editingBlog = blog;
    const minutes = parseInt(blog.readTime ?? '', 10);
    this.newBlog = {
      ...emptyBlog(),
      ...blog,
      tags: [...(blog.tags ?? [])],
      readMinutes: isNaN(minutes) ? null : minutes,
      publishDate: (blog.publishDate ?? '').slice(0, 10),
    };
    this.tagInput = '';
    this.showBlogModal = true;
  }

  public deleteBlog(blog: Blog): void {
    if (!confirm(`Delete the blog post "${blog.title}"?`)) return;
    this.api.admin.deleteBlog(blog.slug).subscribe({
      next: () => {
        this.toasterService.showToast('Blog deleted successfully', ToastType.Success);
        this.loadBlogs();
      },
      error: err => this.toasterService.showToast(apiErrorMessage(err, 'Failed to delete blog'), ToastType.Error)
    });
  }

  public saveBlog(): void {
    const f = this.newBlog;
    if (!f.title?.trim() || (!f.content?.trim() && !f.externalUrl?.trim())) {
      this.toasterService.showToast('Title and content (or an external URL) are required', ToastType.Warn);
      return;
    }
    const slug = slugify(f.slug?.trim() || f.title);
    if (!slug) {
      this.toasterService.showToast('Please enter a valid URL slug', ToastType.Warn);
      return;
    }
    const clash = this.blogs.find(b => b.slug === slug && b.slug !== this.editingBlog?.slug);
    if (clash) {
      this.toasterService.showToast(`Another blog already uses the URL "${slug}"`, ToastType.Warn);
      return;
    }
    const { readMinutes, ...rest } = f;
    const body: Blog = {
      ...rest,
      slug,
      title: f.title.trim(),
      readTime: readMinutes ? `${readMinutes} min read` : (f.readTime || ''),
      publishDate: f.publishDate || undefined,
      tags: f.tags ?? [],
      seoTitle: f.seoTitle?.trim() || undefined,
      seoDescription: f.seoDescription?.trim() || undefined,
    };
    this.saving = true;
    const req = this.editingBlog ? this.api.admin.updateBlog(this.editingBlog.slug, body) : this.api.admin.createBlog(body);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.toasterService.showToast(this.editingBlog ? 'Blog updated successfully' : 'Blog created successfully', ToastType.Success);
        this.closeBlogModal();
        this.loadBlogs();
      },
      error: err => {
        this.saving = false;
        this.toasterService.showToast(apiErrorMessage(err, 'Failed to save blog'), ToastType.Error);
      }
    });
  }

  public async onImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toasterService.showToast('Please choose an image file', ToastType.Warn);
      return;
    }
    this.uploading = true;
    try {
      this.newBlog.image = await this.api.upload(file);
      this.toasterService.showToast('Image uploaded', ToastType.Success);
    } catch (err) {
      this.toasterService.showToast(apiErrorMessage(err, 'Image upload failed'), ToastType.Error);
    } finally {
      this.uploading = false;
    }
  }

  public closeBlogModal(): void {
    this.showBlogModal = false;
    this.editingBlog = null;
    this.newBlog = emptyBlog();
  }

  public addTag(): void {
    const tag = this.tagInput.trim();
    if (!tag) return;
    this.newBlog.tags = this.newBlog.tags ?? [];
    if (!this.newBlog.tags.includes(tag)) this.newBlog.tags.push(tag);
    this.tagInput = '';
  }

  public removeTag(tag: string): void {
    this.newBlog.tags = (this.newBlog.tags ?? []).filter(t => t !== tag);
  }

  public formatDate(date?: string | null): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return isNaN(d.getTime()) ? date : d.toLocaleDateString('en-IN');
  }

  public getStatusBadgeClass(blog: Blog): string {
    return blog.published === false ? 'badge bg-secondary' : 'badge bg-success';
  }

  public getStatusText(blog: Blog): string {
    return blog.published === false ? 'Draft' : 'Published';
  }

  public get publishedCount(): number {
    return this.blogs.filter(b => b.published !== false).length;
  }

  public get externalContentCount(): number {
    return this.blogs.filter(b => b.externalUrl).length;
  }

  public get uniqueCategoriesCount(): number {
    return new Set(this.blogs.map(b => b.category).filter(c => c)).size;
  }

  public onImgError(event: Event): void {
    (event.target as HTMLImageElement).src = 'assets/images/image_empty.jpg';
  }
}
