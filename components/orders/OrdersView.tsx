"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api.client";
import { buttonVariants } from "@/lib/classes";
import { formatIDR } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

const STEPS: OrderStatus[] = ["pending", "paid", "shipped", "delivered"];

/**
 * The signed-in customer's orders. GET /orders needs their token, so this loads in the browser;
 * the API scopes the list to the token's owner. Only customers get here (CustomerRoute) - staff
 * handle orders in the dashboard and don't place any.
 */
export default function OrdersView() {
  const { fmt } = useSettings();
  const { currentUser } = useAuth();
  const { data: orders, error } = useApiData(currentUser ? `orders:${currentUser.id}` : null, api.orders);
  if (error) throw error; // -> app/orders/error.tsx

  if (!orders) {
    return (
      <div className="space-y-4" aria-busy data-testid="orders-loading">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>
    );
  }
  const mine = orders.filter((o) => o.user_id === currentUser?.id);

  if (mine.length === 0) {
    return (
      <>
        <div className="panel grid place-items-center gap-4 px-6 py-20 text-center" data-testid="orders-empty">
          <p className="font-mono text-xs tracking-[0.24em] text-faint uppercase">{"// "}no orders yet</p>
          <p className="text-dim">When you check out, your orders show up here.</p>
          <Link href="/products" className={buttonVariants.primary}>
            Start shopping
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <ul className="space-y-4" data-testid="orders-list">
        {mine.map((o) => {
          const step = STEPS.indexOf(o.order_status);
          return (
            <li key={o.order_id}>
              <Card
                as={Link}
                href={`/orders/${o.order_id}`}
                interactive
                className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center"
                data-testid="order-row"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-mono text-lg">#{String(o.order_id).padStart(4, "0")}</p>
                    <StatusBadge status={o.order_status} />
                  </div>
                  <p className="text-sm text-dim">
                    {fmt.dateTime(o.ordered_at)} · {o.item_count ?? "—"} {o.item_count === 1 ? "item" : "items"}
                  </p>
                  {o.order_status !== "cancelled" && (
                    <ol className="flex max-w-xs gap-1.5 pt-1" aria-label={`Progress: ${o.order_status}`}>
                      {STEPS.map((s, i) => (
                        <li key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-cyan" : "bg-line"}`} title={s} />
                      ))}
                    </ol>
                  )}
                </div>
                <p className="font-mono text-xl font-semibold tabular sm:text-right">{formatIDR(o.total_amount)}</p>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
