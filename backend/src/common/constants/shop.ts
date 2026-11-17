export const CURRENCY = 'UAH';

// Cart limits
export const MAX_CART_ITEMS = 50;
export const MIN_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 99;

// Product catalog
export const PRODUCT_CATEGORIES = [
  'kitchen',
  'textile',
  'decor',
  'furniture',
  'lighting',
  'storage',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc', 'relevance'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const MAX_PRODUCT_IMAGES = 10;
export const MAX_PRODUCT_STOCK = 1_000_000;
export const MAX_SEARCH_QUERY_LENGTH = 100;

// Prices are integers in "cents" (for UAH these are kopiykas), never floats
export const MIN_PRICE_CENTS = 1;
export const MAX_PRICE_CENTS = 100_000_000;
