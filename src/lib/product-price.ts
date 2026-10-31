export type ProductPricing = { price: number; discountPrice?: number | null };

// Invalid legacy/imported discounts are never used for display or charging.
export function effectiveBasePrice(product: ProductPricing): number {
  const discount = product.discountPrice;
  return typeof discount === 'number' && Number.isSafeInteger(discount) && discount >= 0 && discount < product.price ? discount : product.price;
}
