"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LABEL_STATUSES, orderNo } from "@/components/dashboard/OrderManager";
import ShippingLabel from "@/components/dashboard/ShippingLabel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings } from "@/context/SettingsContext";
import { describeError } from "@/lib/api";
import { api } from "@/lib/api.client";
import { buttonVariants, cx } from "@/lib/classes";
import { STATUS_LABEL } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";

const MAX_LABELS = 50;

type Loaded = { labels: OrderDetail[]; skipped: { id: number; why: string }[] };

/**
 * Shipping labels for ?ids=1,2,3 - one or many - each on its own 100 x 150 mm page when printed.
 * Orders that aren't paid yet (or were cancelled) are listed as skipped instead of printed.
 */
export default function LabelSheet() {
  const settings = useSettings();
  const raw = useSearchParams().get("ids") ?? "";
  const [state, setState] = useState<Loaded | null>(null);

  useEffect(() => {
    const ids = [...new Set(raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_LABELS);
    let cancelled = false;
    Promise.allSettled(ids.map((id) => api.order(id))).then((results) => {
      if (cancelled) return;
      const loaded: Loaded = { labels: [], skipped: [] };
      results.forEach((r, i) => {
        if (r.status === "rejected") loaded.skipped.push({ id: ids[i], why: describeError(r.reason) });
        else if (!LABEL_STATUSES.includes(r.value.order_status)) loaded.skipped.push({ id: ids[i], why: `${STATUS_LABEL[r.value.order_status]} — not paid yet` });
        else loaded.labels.push(r.value);
      });
      setState(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [raw]);

  if (!state) return <Skeleton className="h-[150mm] w-[100mm]" />;
  const { labels, skipped } = state;

  return (
    <div className="space-y-6">
      <div className="print-hide flex flex-wrap items-center gap-3">
        <button type="button" disabled={labels.length === 0} onClick={() => window.print()} className={buttonVariants.primary} data-testid="labels-print">
          Print {labels.length} {labels.length === 1 ? "label" : "labels"}
        </button>
        <Link href="/dashboard/orders" className={buttonVariants.ghost}>
          ← Orders
        </Link>
        <p className="text-sm text-dim">A6 (100 × 150 mm), one per page — choose your label printer, or A6 paper, with margins off.</p>
      </div>

      {!settings.shop_address && (
        <p className="print-hide rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber" data-testid="labels-no-address">
          The sender address is empty. Add the shop address in{" "}
          <Link href="/dashboard/settings" className="underline">
            Dashboard → Settings
          </Link>{" "}
          before printing.
        </p>
      )}

      {skipped.length > 0 && (
        <div className="print-hide rounded-xl border border-line px-4 py-3 text-sm text-dim" data-testid="labels-skipped">
          <p className="mb-1 font-medium text-ink">Not printed:</p>
          <ul className="list-inside list-disc">
            {skipped.map((s) => (
              <li key={s.id}>
                {orderNo(s.id)} — {s.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      {labels.length === 0 ? (
        <p className="print-hide text-dim" data-testid="labels-empty">
          No paid orders to print.
        </p>
      ) : (
        <div className={cx("print-labels flex flex-wrap gap-6")} data-testid="labels">
          {labels.map((o) => (
            <ShippingLabel key={o.order_id} order={o} settings={settings} />
          ))}
        </div>
      )}
    </div>
  );
}
