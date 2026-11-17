import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../environments/environment';
import { localProductImage } from '../../../../../src/app/core/local-product-images';

/**
 * Product photos still point at the old site's 5–30 MB camera originals. On phones use the storefront's web-sized
 * copies instead (same list the storefront uses); any other URL (e.g. photos uploaded in admin) is unchanged.
 */
@Pipe({ name: 'webImg', standalone: true })
export class WebImgPipe implements PipeTransform {
  transform(url: string | null | undefined): string {
    if (!url) return '';
    const local = localProductImage(url);
    return local === url ? url : `${environment.storefrontUrl}/${local}`;
  }
}
