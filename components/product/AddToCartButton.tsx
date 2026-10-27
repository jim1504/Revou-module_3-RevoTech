"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { buttonVariants, cx, getButtonClasses } from "@/lib/classes";
import { toast } from "@/lib/toast";
import type { CartItem, Product } from "@/lib/types";
import { hasVariants } from "@/lib/variants";

/**
 * What can go in the cart: a product, or - with variant_id and its label - one of its variants,
 * carrying that variant's price and stock. A product with variants but no variant picked (a
 * catalogue card) gets a link to its page to choose one instead.
 */
export type Buyable = Pick<Product, "product_id" | "product_name" | "price" | "stock_quantity" | "is_active"> &
  Pick<CartItem, "variant_id" | "variant_label"> &
  Partial<Pick<Product, "option_groups">>;

export default function AddToCartButton({
  product,
  quantity = 1,
  className,
  onAdded,
}: {
  product: Buyable;
  quantity?: number;
  className?: string;
  onAdded?: () => void;
}) {
  const { isLoggedIn, isReady, can } = useAuth();
  const { addToCart, quantityOf } = useCart();
  const pathname = usePathname();

  // Before the session is restored we do not know which button to show - render an inert
  // placeholder of the same size rather than flashing "Login to buy" at a signed-in user.
  if (!isReady) {
    return (
      <span className={cx(getButtonClasses(false), "opacity-60", className)} aria-hidden>
        Add to cart
      </span>
    );
  }

  if (!isLoggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className={cx(buttonVariants.secondary, "px-4", className)}
        data-testid="login-to-buy"
      >
        Login to buy
      </Link>
    );
  }

  // Staff run the shop; only customers buy (orders:place - the API refuses the rest too).
  if (!can("orders:place")) {
    return (
      <p className={cx("self-center font-mono text-xs text-faint", className)} data-testid="staff-no-order">
        Staff accounts can&apos;t place orders
      </p>
    );
  }

  if (hasVariants(product) && !product.variant_id) {
    return (
      <Link
        href={`/products/${product.product_id}`}
        className={cx(buttonVariants.secondary, "px-4", className)}
        data-testid="choose-options"
      >
        Choose options
      </Link>
    );
  }

  const inCart = quantityOf(product.product_id, product.variant_id);
  const remaining = product.stock_quantity - inCart;
  const canBuy = product.is_active && remaining > 0;

  const label = !product.is_active
    ? "Unavailable"
    : product.stock_quantity <= 0
      ? "Sold out"
      : remaining <= 0
        ? "Max in cart"
        : "Add to cart";

  return (
    <button
      type="button"
      disabled={!canBuy}
      className={cx(getButtonClasses(canBuy), className)}
      data-testid="add-to-cart"
      onClick={() => {
        const qty = Math.min(quantity, remaining);
        addToCart(product, qty);
        const name = product.variant_label ? `${product.product_name} (${product.variant_label})` : product.product_name;
        toast.success(`${qty} × ${name} added to cart`);
        onAdded?.();
      }}
    >
      {canBuy && (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      )}
      {label}
    </button>
  );
}
