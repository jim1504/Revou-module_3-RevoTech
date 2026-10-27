"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Product, ProductVariant } from "@/lib/types";
import { activeVariants, defaultVariant, findVariant, hasVariants } from "@/lib/variants";

interface Selection {
  /** the picked variant, or undefined for a product without variants */
  variant: ProductVariant | undefined;
  choices: Record<string, string>;
  choose: (group: string, value: string) => void;
}

const SelectionContext = createContext<Selection | null>(null);

/**
 * Which variant the product page is showing. Shared by the buy box (price, stock, add to cart)
 * and the gallery (the variant's photo), which sit in different columns of the page.
 */
export function VariantSelectionProvider({ product, children }: { product: Product; children: ReactNode }) {
  const [choices, setChoices] = useState<Record<string, string>>(() => defaultVariant(product)?.options ?? {});

  const choose = useCallback(
    (group: string, value: string) =>
      setChoices((current) => {
        const next = { ...current, [group]: value };
        if (findVariant(product, next)) return next;
        // That value doesn't exist alongside the other current choices (e.g. 8TB only in Black):
        // jump to a variant that has it, in stock first.
        const fallback = activeVariants(product)
          .filter((v) => v.options[group] === value)
          .sort((a, b) => Number(b.stock_quantity > 0) - Number(a.stock_quantity > 0))[0];
        return fallback ? { ...fallback.options } : current;
      }),
    [product]
  );

  const value = useMemo<Selection>(
    () => ({ variant: hasVariants(product) ? findVariant(product, choices) : undefined, choices, choose }),
    [product, choices, choose]
  );
  return <SelectionContext value={value}>{children}</SelectionContext>;
}

/** The product page's selection - null outside a VariantSelectionProvider. */
export const useVariantSelection = () => useContext(SelectionContext);
