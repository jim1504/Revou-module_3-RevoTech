"use client";

import { useEffect, useState } from "react";
import type { SiteSettings } from "@/lib/settings";
import { splitWordmark } from "@/lib/settings";
import type { OrderDetail } from "@/lib/types";

/** "RevoTech", order 123 -> "RT-000123": the order number on the label and in its barcode. */
export function labelCode(shopName: string, orderId: number): string {
  const prefix =
    splitWordmark(shopName)
      .map((part) => part.trim()[0] ?? "")
      .join("")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "") || "ORD";
  return `${prefix}-${String(orderId).padStart(6, "0")}`;
}

/**
 * A Code 128 barcode of `text`, drawn by bwip-js (a tested encoder - a label that doesn't scan is
 * worse than none). Loaded on demand: only this page needs it.
 */
function Barcode({ text }: { text: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("bwip-js/browser").then(({ code128, drawingSVG }) => {
      if (cancelled) return;
      setSvg(code128({ bcid: "code128", text, height: 13, scale: 3, includetext: true, textxalign: "center", textsize: 11 }, drawingSVG()));
    });
    return () => {
      cancelled = true;
    };
  }, [text]);
  return (
    <div
      className="label-barcode flex h-[19mm] items-center justify-center [&>svg]:h-full [&>svg]:w-auto"
      role="img"
      aria-label={`Barcode ${text}`}
      data-testid="label-barcode"
      // bwip-js output for our own order number - no user input reaches it
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

/* ISO 780 handling marks, drawn as plain black strokes so they print crisply on a thermal printer. */
const PICTOGRAMS = [
  {
    id: "fragile",
    en: "Fragile",
    id_: "Pecah belah",
    icon: (
      <>
        <path d="M7 3h10l-.6 5.5A4.5 4.5 0 0 1 12 12.6a4.5 4.5 0 0 1-4.4-4.1Z" />
        <path d="M12 12.6V19M8 21h8" />
        <path d="m10.5 3 1.6 2.4-1.8 1.6 1.7 2" />
      </>
    ),
  },
  {
    id: "dry",
    en: "Keep dry",
    id_: "Jaga tetap kering",
    icon: (
      <>
        <path d="M3 12a9 7 0 0 1 18 0Z" />
        <path d="M12 12v6.5a1.8 1.8 0 0 1-3.6 0" />
        <path d="M6 2.5 5 5M12 1.5 11 4M18 2.5l-1 2.5" />
      </>
    ),
  },
  {
    id: "up",
    en: "This way up",
    id_: "Sisi ini di atas",
    icon: (
      <>
        <path d="M8 18V5M4.5 8.5 8 5l3.5 3.5M16 18V5M12.5 8.5 16 5l3.5 3.5" />
        <path d="M3 21h18" />
      </>
    ),
  },
] as const;

const MAX_LINES = 7;

/**
 * The 100 x 150 mm shipping sticker for one order: who it goes to and comes from, what is in the
 * box, the courier and resi once known, and the standard handling marks. Black on white whatever
 * the dashboard theme, sized in millimetres for A6 thermal label stock.
 */
export default function ShippingLabel({ order, settings }: { order: OrderDetail; settings: SiteSettings }) {
  const code = labelCode(settings.shop_name, order.order_id);
  const name = order.recipient_name ?? order.username ?? `Customer ${order.user_id}`;
  const phone = order.recipient_phone ?? order.customer_phone ?? "";
  const lines = order.items.slice(0, MAX_LINES);
  const more = order.items.length - lines.length;
  const units = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <article
      className="shipping-label flex h-[150mm] w-[100mm] flex-col overflow-hidden border border-black bg-white font-sans text-[9pt] leading-snug text-black"
      aria-label={`Shipping label for order ${code}`}
      data-testid="shipping-label"
    >
      <header className="flex items-center justify-between gap-2 border-b-2 border-black px-[3mm] py-[2mm]">
        <div className="flex min-w-0 items-center gap-[2mm]">
          {/* eslint-disable-next-line @next/next/no-img-element -- the store's SVG logo, printed as-is */}
          <img src={`/api/logo?variant=icon&v=${settings.logo_version}`} alt="" className="size-[9mm] shrink-0 grayscale" />
          <span className="truncate text-[12pt] font-bold">{settings.shop_name}</span>
        </div>
        <div className="text-right">
          <p className="text-[7pt] tracking-widest uppercase">Order</p>
          <p className="font-mono text-[10pt] font-bold" data-testid="label-code">
            {code}
          </p>
        </div>
      </header>

      <div className="border-b border-black px-[3mm] py-[1.5mm]">
        <Barcode text={code} />
      </div>

      <section className="border-b-2 border-black px-[3mm] py-[2mm]" data-testid="label-to">
        <p className="text-[7pt] font-bold tracking-widest uppercase">To · Penerima</p>
        <p className="text-[13pt] leading-tight font-bold">{name}</p>
        {phone && <p className="font-mono text-[10pt] font-bold">{phone}</p>}
        <p className="mt-[0.5mm] text-[10pt] whitespace-pre-line">{order.shipping_address}</p>
      </section>

      <section className="border-b border-black px-[3mm] py-[1.5mm]" data-testid="label-from">
        <p className="text-[7pt] font-bold tracking-widest uppercase">From · Pengirim</p>
        <p className="font-bold">
          {settings.shop_name}
          {settings.support_phone && <span className="font-mono font-normal"> · {settings.support_phone}</span>}
        </p>
        <p className="whitespace-pre-line">{settings.shop_address || "—"}</p>
      </section>

      <section className="flex items-center justify-between gap-2 border-b border-black px-[3mm] py-[1.5mm]" data-testid="label-courier">
        <span>
          <span className="text-[7pt] font-bold tracking-widest uppercase">Courier </span>
          <span className="font-bold">{order.courier ?? "________"}</span>
        </span>
        <span className="font-mono">resi {order.tracking_number ?? "______________"}</span>
      </section>

      <section className="min-h-0 flex-1 px-[3mm] py-[1.5mm]" data-testid="label-items">
        <p className="text-[7pt] font-bold tracking-widest uppercase">
          Contents · Isi paket — {units} {units === 1 ? "item" : "items"}
        </p>
        <ul className="mt-[0.5mm] space-y-[0.3mm] text-[8pt]">
          {lines.map((i) => (
            <li key={i.order_item_id} className="flex gap-[1.5mm]">
              <span className="w-[7mm] shrink-0 text-right font-mono font-bold">{i.quantity}×</span>
              <span className="min-w-0 truncate">
                {i.product_name}
                {i.variant_label && <span className="font-bold"> — {i.variant_label}</span>}
              </span>
            </li>
          ))}
          {more > 0 && <li className="pl-[8.5mm] italic">+ {more} more</li>}
        </ul>
      </section>

      <footer className="border-t-2 border-black px-[2mm] py-[1.5mm]" data-testid="label-warnings">
        <div className="grid grid-cols-3 gap-[1mm] text-center">
          {PICTOGRAMS.map((p) => (
            <div key={p.id} className="flex flex-col items-center" data-testid={`label-mark-${p.id}`}>
              <svg viewBox="0 0 24 24" className="size-[9mm]" fill="none" stroke="#000" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {p.icon}
              </svg>
              <span className="text-[6.5pt] leading-tight font-bold uppercase">{p.en}</span>
              <span className="text-[6pt] leading-tight">{p.id_}</span>
            </div>
          ))}
        </div>
        <p className="mt-[1mm] border-t border-black pt-[1mm] text-center text-[8pt] font-bold tracking-wide uppercase">
          Jangan dibanting · Electronic components
        </p>
      </footer>
    </article>
  );
}
