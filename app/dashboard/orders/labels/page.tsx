import type { Metadata } from "next";
import { Suspense } from "react";
import { RequirePermission } from "@/components/auth/Guards";
import LabelSheet from "@/components/dashboard/LabelSheet";
import PageHeader from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Shipping labels · Dashboard", robots: { index: false } };

/** Shipping labels for paid orders: /dashboard/orders/labels?ids=12,14 (one or many). */
export default function ShippingLabelsPage() {
  return (
    <RequirePermission permission="orders:manage">
      <div className="print-hide">
        <PageHeader eyebrow="Admin · Orders" title="Shipping labels">
          One sticker per paid order: recipient, sender, contents, courier and the handling marks.
        </PageHeader>
      </div>
      {/* useSearchParams needs a Suspense boundary to keep the rest of the page static */}
      <Suspense fallback={null}>
        <LabelSheet />
      </Suspense>
    </RequirePermission>
  );
}
