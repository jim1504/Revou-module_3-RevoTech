"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, describeError } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { api, type OrderUpdate } from "@/lib/api.client";
import { buttonVariants, cx, inputClasses } from "@/lib/classes";
import { formatIDR, STATUS_LABEL } from "@/lib/format";
import { toast } from "@/lib/toast";
import { COURIERS, type Courier, type OrderDetail, type OrderStatus } from "@/lib/types";

export const PIPELINE: OrderStatus[] = ["pending", "paid", "shipped", "delivered"];

/** The action that moves an order one step along, or null when it is finished. */
export const NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  pending: { to: "paid", label: "Mark paid" },
  paid: { to: "shipped", label: "Mark shipped" },
  shipped: { to: "delivered", label: "Mark delivered" },
};

export const orderNo = (id: number) => `#${String(id).padStart(4, "0")}`;

/** Orders that have been paid for get a shipping label. */
export const LABEL_STATUSES: OrderStatus[] = ["paid", "shipped", "delivered"];
export const labelsHref = (ids: number[]) => `/dashboard/orders/labels?ids=${ids.join(",")}`;

// the API's rule for tracking_number (resi)
const TRACKING = /^[A-Za-z0-9-]{4,40}$/;

/**
 * One order, for the admin: its lines, where it is in the pipeline, and what PUT /orders/[id] can
 * change - the status (any step, cancel, reopen), the shipping address, and the courier with its
 * tracking number, which marking it shipped requires. Paid orders link to their shipping label.
 */
export default function OrderManager({ orderId, onChanged }: { orderId: number; onChanged: (order: OrderDetail) => void }) {
  const { fmt } = useSettings();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [courier, setCourier] = useState<Courier | "">("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .order(orderId)
      .then((o) => {
        if (cancelled) return;
        setOrder(o);
        setAddress(o.shipping_address);
        setCourier(o.courier ?? "");
        setTracking(o.tracking_number ?? "");
      })
      .catch((e) => !cancelled && setLoadError(describeError(e)));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function update(data: OrderUpdate, success: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.updateOrder(orderId, data);
      setOrder(res.order);
      setAddress(res.order.shipping_address);
      onChanged(res.order);
      toast.success(success);
    } catch (e) {
      setError(e instanceof ApiError ? (e.body.details?.join(" · ") ?? e.message) : describeError(e));
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="text-sm text-rose">{loadError}</p>;
  if (!order) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-10" />
        <Skeleton className="h-32" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  const cancelled = order.order_status === "cancelled";
  const step = PIPELINE.indexOf(order.order_status);
  const shippingReady = Boolean(courier) && TRACKING.test(tracking.trim());
  const shippingFields = { courier: courier || null, tracking_number: tracking.trim() || null };
  const setStatus = (to: OrderStatus) => {
    // shipping needs the courier and its resi - send them with the status
    if (to === "shipped" && order.order_status !== "shipped") {
      if (!shippingReady) {
        setError("Choose the courier and enter the tracking number (resi) under Shipping first.");
        document.getElementById("om-courier")?.focus();
        return;
      }
      return update({ order_status: to, ...shippingFields }, `${orderNo(orderId)} shipped with ${courier}`);
    }
    return update({ order_status: to }, `${orderNo(orderId)} marked as ${STATUS_LABEL[to].toLowerCase()}`);
  };

  return (
    <div className="space-y-6" data-testid="order-manager">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={order.order_status} />
        <span className="text-dim">{order.username ?? `User ${order.user_id}`}</span>
        <span className="text-faint">· placed {fmt.dateTime(order.ordered_at)}</span>
        {LABEL_STATUSES.includes(order.order_status) && (
          <Link
            href={labelsHref([order.order_id])}
            target="_blank"
            rel="noopener"
            className={cx(buttonVariants.secondary, "ml-auto px-3 py-1.5 text-xs")}
            data-testid="om-print-label"
          >
            Print label
          </Link>
        )}
      </div>

      {/* status pipeline: every step is a button - Flask allows any status to follow any other */}
      <section aria-labelledby="om-status" className="space-y-3">
        <h3 id="om-status" className="font-mono text-[0.68rem] tracking-[0.16em] text-cyan uppercase">
          Status
        </h3>
        <ol className="grid grid-cols-4 gap-1.5" aria-label="Order progress">
          {PIPELINE.map((s, i) => {
            const current = s === order.order_status;
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={busy || current}
                  onClick={() => setStatus(s)}
                  aria-current={current ? "step" : undefined}
                  className={cx(
                    "w-full rounded-lg border px-2 py-2 font-mono text-[0.65rem] tracking-widest uppercase transition",
                    current
                      ? "border-cyan bg-cyan text-void"
                      : !cancelled && i < step
                        ? "border-cyan/40 bg-cyan/10 text-cyan"
                        : "border-line text-dim hover:border-cyan hover:text-cyan",
                    "disabled:cursor-default"
                  )}
                  data-testid={`om-step-${s}`}
                >
                  {STATUS_LABEL[s]}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-2">
          {NEXT_STEP[order.order_status] && (
            <button type="button" disabled={busy} onClick={() => setStatus(NEXT_STEP[order.order_status]!.to)} className={cx(buttonVariants.primary, "px-4 py-2 text-xs")} data-testid="om-next">
              {NEXT_STEP[order.order_status]!.label}
            </button>
          )}
          {cancelled ? (
            <button type="button" disabled={busy} onClick={() => setStatus("pending")} className={cx(buttonVariants.secondary, "px-4 py-2 text-xs")} data-testid="om-reopen">
              Reopen as pending
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => window.confirm(`Cancel order ${orderNo(orderId)}? Its items go back into stock.`) && setStatus("cancelled")}
              className={cx(buttonVariants.ghost, "px-4 py-2 text-xs text-rose")}
              data-testid="om-cancel"
            >
              Cancel order
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-rose" data-testid="om-error">
            {error}
          </p>
        )}
      </section>

      <section aria-labelledby="om-items" className="space-y-2">
        <h3 id="om-items" className="font-mono text-[0.68rem] tracking-[0.16em] text-cyan uppercase">
          Items
        </h3>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {order.items.map((i) => (
              <tr key={i.order_item_id}>
                <td className="py-2 pr-3">
                  {i.product_name}
                  {i.variant_label && <span className="block font-mono text-xs text-dim">{i.variant_label}</span>}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-dim tabular">
                  {i.quantity} × {formatIDR(i.unit_price)}
                </td>
                <td className="py-2 text-right font-mono tabular">{formatIDR(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-bright">
              <th scope="row" colSpan={2} className="py-2 pr-3 text-left font-normal text-dim">
                Total
              </th>
              <td className={cx("py-2 text-right font-mono font-semibold tabular", cancelled && "text-faint line-through")}>{formatIDR(order.total_amount)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section aria-labelledby="om-shipping" className="space-y-2">
        <h3 id="om-shipping" className="font-mono text-[0.68rem] tracking-[0.16em] text-cyan uppercase">
          Shipping
        </h3>
        <p className="text-sm text-dim">
          To {order.recipient_name ?? order.username ?? "—"} · {order.recipient_phone ?? order.customer_phone ?? "no phone on file"}
        </p>
        <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
          <select
            id="om-courier"
            aria-label="Courier"
            value={courier}
            onChange={(e) => setCourier(e.target.value as Courier | "")}
            className={cx(inputClasses, "text-sm")}
            data-testid="om-courier"
          >
            <option value="">Courier…</option>
            {COURIERS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            aria-label="Tracking number (resi)"
            value={tracking}
            maxLength={40}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Tracking number (resi)"
            className={cx(inputClasses, "font-mono text-sm")}
            data-testid="om-tracking"
          />
          <button
            type="button"
            disabled={busy || !shippingReady || (courier === (order.courier ?? "") && tracking.trim() === (order.tracking_number ?? ""))}
            onClick={() => update(shippingFields, `${orderNo(orderId)} courier saved`)}
            className={cx(buttonVariants.secondary, "px-4 py-2 text-xs")}
            data-testid="om-save-shipping"
          >
            Save
          </button>
        </div>
      </section>

      <section aria-labelledby="om-address" className="space-y-2">
        <label id="om-address" htmlFor="om-address-input" className="font-mono text-[0.68rem] tracking-[0.16em] text-cyan uppercase">
          Shipping address
        </label>
        <textarea
          id="om-address-input"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={cx(inputClasses, "resize-y text-sm")}
          data-testid="om-address"
        />
        <button
          type="button"
          disabled={busy || !address.trim() || address.trim() === order.shipping_address}
          onClick={() => update({ shipping_address: address }, `${orderNo(orderId)} address updated`)}
          className={cx(buttonVariants.secondary, "px-4 py-2 text-xs")}
          data-testid="om-save-address"
        >
          Save address
        </button>
      </section>
    </div>
  );
}
