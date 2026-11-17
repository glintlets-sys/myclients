import { Injectable } from '@angular/core';
import { ApiService, Params } from '@shared/core/api.service';
import { Blog, Category, Coupon, Order, PageResult, Product, SeoReport, User } from '@shared/core/models';

/**
 * The shared API client plus the tenant-admin endpoints (/v1/admin/**). Lives in the admin app only, so the
 * storefront bundle carries none of it. Admin screens inject this instead of ApiService; the storefront-style
 * calls (categories(), get(), …) are inherited.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi extends ApiService {
  // ---------- admin ----------
  admin = {
    me: () => this.get<User>('/v1/admin/me'),
    dashboard: () => this.get<any>('/v1/admin/dashboard'),
    products: (params: Params) => this.get<{ items: Product[]; page: number; size: number; total: number }>('/v1/admin/products', params),
    product: (id: string) => this.get<Product>(`/v1/admin/products/${id}`),
    createProduct: (p: Partial<Product>) => this.post<Product>('/v1/admin/products', p),
    updateProduct: (id: string, p: Partial<Product>) => this.put<Product>(`/v1/admin/products/${id}`, p),
    setProductActive: (id: string, active: boolean) => this.patch<Product>(`/v1/admin/products/${id}/status`, { active }),
    deleteProduct: (id: string) => this.delete(`/v1/admin/products/${id}`),
    exportProducts: () => this.get<{ rows: any[] }>('/v1/admin/products/export'),
    setRecommendations: (id: string, body: { relatedProductIds?: string[]; boughtTogetherIds?: string[] }) =>
      this.put<Product>(`/v1/admin/products/${id}/recommendations`, body),
    productReviews: (id: string) => this.get<PageResult<any>>(`/v1/admin/products/${id}/reviews`),
    moderateReview: (id: string, key: string, status: 'PUBLISHED' | 'HIDDEN') =>
      this.patch(`/v1/admin/products/${id}/reviews/${encodeURIComponent(key)}`, { status }),
    stock: () => this.get<{ items: any[] }>('/v1/admin/stock'),
    setStock: (variantId: string, body: { qty?: number; delta?: number; productId?: string; expectedQty?: number }) =>
      this.put<{ variantId: string; qty: number }>(`/v1/admin/stock/${variantId}`, body),
    previewImport: (rows: any[]) => this.post<{ rows: any[] }>('/v1/admin/stock/import/preview', { rows }),
    consignments: () => this.get<{ items: any[] }>('/v1/admin/consignments'),
    consignment: (id: string) => this.get<any>(`/v1/admin/consignments/${id}`),
    createConsignment: (c: any) => this.post<any>('/v1/admin/consignments', c),
    updateConsignment: (id: string, c: any) => this.put<any>(`/v1/admin/consignments/${id}`, c),
    applyConsignment: (id: string) => this.post<any>(`/v1/admin/consignments/${id}/apply`),
    deleteConsignment: (id: string) => this.delete(`/v1/admin/consignments/${id}`),
    categories: () => this.get<{ categories: Category[] }>('/v1/admin/categories'),
    createCategory: (c: Partial<Category>) => this.post<Category>('/v1/admin/categories', c),
    updateCategory: (id: string, c: Partial<Category>) => this.put<Category>(`/v1/admin/categories/${id}`, c),
    deleteCategory: (id: string) => this.delete(`/v1/admin/categories/${id}`),
    orders: (params: Params) => this.get<PageResult<Order>>('/v1/admin/orders', params),
    order: (id: string) => this.get<Order>(`/v1/admin/orders/${id}`),
    setOrderStatus: (id: string, body: { status: string; note?: string; courier?: string; awb?: string; trackingUrl?: string }) =>
      this.post<Order>(`/v1/admin/orders/${id}/status`, body),
    shipOrder: (id: string) => this.post<Order>(`/v1/admin/orders/${id}/ship`),
    orderTracking: (id: string) => this.get<any>(`/v1/admin/orders/${id}/tracking`),
    markRefunded: (id: string, note?: string) => this.post<Order>(`/v1/admin/orders/${id}/refunded`, { note }),
    customers: (params: Params) => this.get<PageResult<User>>('/v1/admin/customers', params),
    customer: (id: string) => this.get<any>(`/v1/admin/customers/${id}`),
    enquiries: (cursor?: string) => this.get<PageResult<any>>('/v1/admin/enquiries', { cursor }),
    staff: () => this.get<{ users: User[] }>('/v1/admin/users'),
    setStaff: (body: { phone: string; role: string; name?: string; email?: string; permissions?: string[] }) =>
      this.put<User>('/v1/admin/users', body),
    setUserStatus: (id: string, status: 'ACTIVE' | 'BLOCKED') => this.patch<User>(`/v1/admin/users/${id}/status`, { status }),
    blogs: () => this.get<{ blogs: Blog[] }>('/v1/admin/blogs'),
    createBlog: (b: Blog) => this.post<Blog>('/v1/admin/blogs', b),
    updateBlog: (slug: string, b: Blog) => this.put<Blog>(`/v1/admin/blogs/${encodeURIComponent(slug)}`, b),
    deleteBlog: (slug: string) => this.delete(`/v1/admin/blogs/${encodeURIComponent(slug)}`),
    coupons: () => this.get<{ coupons: Coupon[] }>('/v1/admin/coupons'),
    saveCoupon: (c: Coupon) => this.put<Coupon>('/v1/admin/coupons', c),
    deleteCoupon: (code: string) => this.delete(`/v1/admin/coupons/${encodeURIComponent(code)}`),
    settings: () => this.get<any>('/v1/admin/settings'),
    saveSettings: (sections: any) => this.put<any>('/v1/admin/settings', sections),
    saveSecrets: (secrets: Record<string, string>) => this.put<any>('/v1/admin/settings/secrets', secrets),
    uploadUrl: (fileName: string, contentType: string) =>
      this.post<{ uploadUrl: string; method: string; contentType: string; key: string; publicUrl: string }>('/v1/admin/media/upload-url', { fileName, contentType }),
    lastPublish: () => this.get<any>('/v1/admin/publish'),
    publishNow: () => this.post<any>('/v1/admin/publish'),
    /** SEO issues and page counts computed by the last publish. */
    seoReport: () => this.get<SeoReport>('/v1/admin/seo/report'),
  };

  /**
   * Uploads a file straight to S3 with a presigned (signed) PUT URL from the API and returns its public CDN URL.
   * The server signs Content-Type and Cache-Control into the URL (MediaService.s3), so the browser must send exactly
   * those headers — sending only Content-Type made S3 refuse every upload (403 SignatureDoesNotMatch).
   */
  async upload(file: File): Promise<string> {
    const contentType = mediaType(file);
    if (!contentType) throw new Error('Use a JPG, PNG, WebP, GIF or SVG image (or a PDF / MP4).');
    const target = await new Promise<{ uploadUrl: string; contentType: string; publicUrl: string }>((resolve, reject) =>
      this.admin.uploadUrl(file.name, contentType).subscribe({ next: resolve, error: reject }));
    const headers: Record<string, string> = { 'Content-Type': target.contentType || contentType };
    const signed = (new URL(target.uploadUrl).searchParams.get('X-Amz-SignedHeaders') ?? '').toLowerCase().split(';');
    if (signed.includes('cache-control')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    const res = await fetch(target.uploadUrl, { method: 'PUT', body: file, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
      throw new Error(`Image upload failed (${res.status}${code ? ' ' + code : ''})`);
    }
    return target.publicUrl;
  }
}

const MEDIA_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  svg: 'image/svg+xml', pdf: 'application/pdf', mp4: 'video/mp4',
};

/** Content type the API accepts: from the browser, else from the file extension ("image/jpg" and blank types happen). */
function mediaType(file: File): string {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/jpg' || t === 'image/pjpeg') return 'image/jpeg';
  if (Object.values(MEDIA_TYPES).includes(t)) return t;
  return MEDIA_TYPES[(file.name.split('.').pop() ?? '').toLowerCase()] ?? '';
}
