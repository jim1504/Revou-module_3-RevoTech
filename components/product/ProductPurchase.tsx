"use client";

import { useState } from "react";
import AddToCartButton, { type Buyable } from "@/components/product/AddToCartButton";
import QuantityCounter from "@/components/ui/QuantityCounter";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { availabilityOf } from "@/lib/format";

/** Quantity picker + add-to-cart for the detail page - for the product, or its picked variant. */
export default function ProductPurchase({ line }: { line: Buyable }) {
  const [quantity, setQuantity] = useState(1);
  const { can } = useAuth();
  const { quantityOf } = useCart();
  const inCart = quantityOf(line.product_id, line.variant_id);
  const availability = availabilityOf(line);
  const purchasable = can("orders:place") && (availability === "in-stock" || availability === "low-stock");
  const maxQty = Math.max(1, line.stock_quantity - inCart);
  const qty = Math.min(quantity, maxQty);

  return (
    <div className="space-y-3" data-testid="purchase">
      <div className="flex flex-wrap items-center gap-3">
        {purchasable && <QuantityCounter value={qty} onChange={setQuantity} max={maxQty} />}
        <AddToCartButton product={line} quantity={qty} className="h-10 min-w-48 flex-1" onAdded={() => setQuantity(1)} />
      </div>
      {inCart > 0 && (
        <p className="font-mono text-xs text-cyan">
          {inCart} already in your cart{line.stock_quantity - inCart <= 0 ? " — that's all we have" : ""}
        </p>
      )}
    </div>
  );
}
