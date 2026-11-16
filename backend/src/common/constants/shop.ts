export const CURRENCY = 'UAH';

// Cart limits
export const MAX_CART_ITEMS = 50;
export const MIN_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 99;

// Prices are integers in "cents" (for UAH these are kopiykas), never floats
export const MIN_PRICE_CENTS = 1;
export const MAX_PRICE_CENTS = 100_000_000;
