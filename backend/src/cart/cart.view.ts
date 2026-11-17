import { CURRENCY } from '../common/constants/shop';
import type { ProductRecord } from '../products/products.types';
import type { CartItemRecord, CartItemView, CartView } from './cart.types';

// Pure function: builds the cart for the API from cart lines and the products found for them.
// A product that is not in `products` was deleted: the line is shown as unavailable.
export function buildCartView(items: CartItemRecord[], products: ProductRecord[]): CartView {
  const productsById = new Map(products.map((product) => [product._id.toString(), product]));

  const lines: CartItemView[] = items.map((item) => {
    const productId = item.productId.toString();
    const product = productsById.get(productId);
    if (!product) {
      return {
        productId,
        quantity: item.quantity,
        available: false,
        exceedsStock: false,
        name: null,
        slug: null,
        priceCents: null,
        stock: null,
        image: null,
        lineTotalCents: 0,
      };
    }
    return {
      productId,
      quantity: item.quantity,
      available: true,
      exceedsStock: item.quantity > product.stock,
      name: product.name,
      slug: product.slug,
      priceCents: product.priceCents,
      stock: product.stock,
      image: product.images[0] ?? null,
      lineTotalCents: product.priceCents * item.quantity,
    };
  });

  return {
    items: lines,
    totalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    currency: CURRENCY,
    canCheckout: lines.length > 0 && lines.every((line) => line.available && !line.exceedsStock),
  };
}
