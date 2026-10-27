"use client";

import ProductPurchase from "@/components/product/ProductPurchase";
import VariantPicker from "@/components/product/VariantPicker";
import { useVariantSelection } from "@/components/product/VariantSelection";
import StockMeter from "@/components/ui/StockMeter";
import { availabilityOf, formatIDR } from "@/lib/format";
import type { Product } from "@/lib/types";
import { hasVariants, labelOf } from "@/lib/variants";

/**
 * Price, stock, the variant picker and add-to-cart. For a product with variants they all
 * follow the picked variant; otherwise they show the product itself.
 */
export default function ProductBuyBox({ product }: { product: Product }) {
  const variant = useVariantSelection()?.variant;
  const withVariants = hasVariants(product);
  const price = variant?.price ?? product.price;
  const stock = variant ? variant.stock_quantity : product.stock_quantity;
  const availability = availabilityOf({ is_active: product.is_active && (!withVariants || Boolean(variant)), stock_quantity: stock });

  return (
    <>
      <p className="font-mono text-3xl font-semibold text-ink tabular sm:text-4xl" data-testid="product-detail-price">
        {formatIDR(price)}
      </p>

      {withVariants && <VariantPicker product={product} />}

      {product.is_active ? (
        <div className="max-w-sm space-y-1.5">
          <p className="font-mono text-[0.68rem] tracking-[0.16em] text-faint uppercase">Stock</p>
          <StockMeter stock={stock} />
          {availability === "low-stock" && (
            <p className="font-mono text-xs text-amber" data-testid="low-stock">
              Only {stock} left — order soon
            </p>
          )}
        </div>
      ) : (
        <p className="panel border-line-bright px-4 py-3 text-sm text-dim">This product has been withdrawn from sale and can&apos;t be ordered.</p>
      )}

      <ProductPurchase
        line={{
          product_id: product.product_id,
          product_name: product.product_name,
          is_active: product.is_active && (!withVariants || Boolean(variant)),
          price,
          stock_quantity: stock,
          ...(variant ? { variant_id: variant.variant_id, variant_label: labelOf(product.option_groups ?? [], variant.options) } : {}),
        }}
      />
    </>
  );
}
