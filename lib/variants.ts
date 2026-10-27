import type { OptionGroup, Product, ProductVariant } from "@/lib/types";

/**
 * Product variants: one product, several buyable combinations of its options (Capacity 1TB/2TB,
 * Color Black/White), each with its own price and stock. The API keeps the product's own price at
 * the lowest active variant price and its stock at their total, so lists only need these helpers
 * to say "from" - the product page, cart and orders work with the variant itself.
 */

type WithVariants = Pick<Product, "option_groups" | "variants">;

export const hasVariants = (p: WithVariants): boolean => Boolean(p.option_groups?.length);

/** The variants a buyer can pick - retired ones stay in the API for past orders only. */
export const activeVariants = (p: WithVariants): ProductVariant[] => (p.variants ?? []).filter((v) => v.is_active);

/** "2TB · White": the option values in the product's group order. */
export function labelOf(groups: OptionGroup[], options: Record<string, string>): string {
  return groups
    .map((g) => options[g.name])
    .filter(Boolean)
    .join(" · ");
}

/** A cart line is a product, or a product's variant: 1TB and 2TB of one drive are two lines. */
export const lineKey = (productId: number, variantId?: number | null): string =>
  variantId ? `${productId}:${variantId}` : String(productId);

/** Lowest and highest active variant price - equal (or null) when there's nothing to say "from" about. */
export function priceRange(p: WithVariants & Pick<Product, "price">): { min: number; max: number } {
  const prices = activeVariants(p).map((v) => v.price);
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: p.price, max: p.price };
}

/** The variant matching a full set of choices, if that combination exists. */
export function findVariant(p: WithVariants, options: Record<string, string>): ProductVariant | undefined {
  const groups = p.option_groups ?? [];
  return activeVariants(p).find((v) => groups.every((g) => v.options[g.name] === options[g.name]));
}

/**
 * Whether picking `value` for `group` - keeping the other current choices - leads to a variant
 * that exists (and whether it is in stock), so the picker can disable dead ends.
 */
export function optionState(
  p: WithVariants,
  current: Record<string, string>,
  group: string,
  value: string
): "available" | "sold-out" | "missing" {
  const variant = findVariant(p, { ...current, [group]: value });
  if (!variant) return "missing";
  return variant.stock_quantity > 0 ? "available" : "sold-out";
}

/** What the product page starts on: the cheapest variant in stock, else the cheapest one. */
export function defaultVariant(p: WithVariants): ProductVariant | undefined {
  const byPrice = [...activeVariants(p)].sort((a, b) => a.price - b.price);
  return byPrice.find((v) => v.stock_quantity > 0) ?? byPrice[0];
}
