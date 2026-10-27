import { bearer, expect, test } from "./fixtures";
import { ADMIN_STATE, CUSTOMER_STATE } from "./global-setup";

/**
 * Shipping labels and the courier step. Seeded orders: #3 shipped with J&T Express, #4 paid
 * (Rizky, with the 1TB Samsung 9100 Pro), #5 still pending.
 */
const isLocal = (baseURL?: string) => /localhost|127\.0\.0\.1/.test(baseURL ?? "");

test.use({ storageState: ADMIN_STATE });

test.describe("shipping labels", () => {
  test("one label per paid order: recipient, sender, contents, courier, barcode and handling marks", async ({ page }) => {
    await page.goto("/dashboard/orders/labels?ids=4,3,5");
    const labels = page.getByTestId("shipping-label");
    await expect(labels).toHaveCount(2);
    await expect(page.getByTestId("labels-skipped")).toContainText("#0005");

    const paid = labels.filter({ hasText: "RT-000004" });
    await expect(paid.getByTestId("label-to")).toContainText("Rizky Ramadhan");
    await expect(paid.getByTestId("label-to")).toContainText("+62-819-5555-0005");
    await expect(paid.getByTestId("label-to")).toContainText("Medan");
    await expect(paid.getByTestId("label-from")).toContainText("Jl. Teknologi Raya No. 8");
    await expect(paid.getByTestId("label-items")).toContainText("Samsung 9100 Pro NVMe — 1TB");
    for (const mark of ["fragile", "dry", "up"]) await expect(paid.getByTestId(`label-mark-${mark}`)).toBeVisible();
    await expect(paid.getByTestId("label-warnings")).toContainText("Jangan dibanting");
    await expect(paid.getByTestId("label-barcode").locator("svg")).toBeVisible();

    const shipped = labels.filter({ hasText: "RT-000003" });
    await expect(shipped.getByTestId("label-courier")).toContainText("J&T Express");
    await expect(shipped.getByTestId("label-courier")).toContainText("JP7012345678");
  });

  test("printing leaves out everything but the labels", async ({ page }) => {
    await page.goto("/dashboard/orders/labels?ids=4");
    await expect(page.getByTestId("shipping-label")).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("labels-print")).toBeHidden();
    await expect(page.getByTestId("site-header")).toBeHidden();
    await expect(page.getByTestId("dashboard-sidebar")).toBeHidden();
    await expect(page.getByTestId("shipping-label")).toBeVisible();
  });

  test("paid orders can be ticked and printed together", async ({ page }) => {
    await page.goto("/dashboard/orders");
    const row = (no: string) => page.getByTestId("admin-order-row").filter({ hasText: no });
    await expect(row("#0005").getByTestId("order-select")).toHaveCount(0); // pending: nothing to print yet
    await row("#0004").getByTestId("order-select").check();
    await row("#0003").getByTestId("order-select").check();
    const print = page.getByTestId("print-labels");
    await expect(print).toHaveText("Print labels (2)");
    await expect(print).toHaveAttribute("href", /ids=(4,3|3,4)$/);
  });
});

test.describe("shipping an order", () => {
  test("needs the courier and resi, which the customer then sees", async ({ page, request, browser, baseURL }) => {
    test.skip(!isLocal(baseURL), "writes to the database");
    const placed = await request.post("/api/orders", {
      headers: bearer("customer"),
      data: { shipping_address: "Jl. Playwright No. 7, Bandung", recipient_phone: "+62 812 0000 0007", items: [{ product_id: 16, quantity: 1 }] },
    });
    expect(placed.status()).toBe(201);
    const { order_id } = (await placed.json()).order;
    const no = `#${String(order_id).padStart(4, "0")}`;

    try {
      await request.put(`/api/orders/${order_id}`, { data: { order_status: "paid" } });
      await page.goto("/dashboard/orders");
      const row = page.getByTestId("admin-order-row").filter({ hasText: no });
      await row.getByTestId("order-next").click(); // "Mark shipped" opens the dialog: it needs the courier
      const manager = page.getByTestId("order-manager");
      await expect(manager.getByTestId("om-print-label")).toHaveAttribute("href", `/dashboard/orders/labels?ids=${order_id}`);

      await manager.getByTestId("om-next").click();
      await expect(manager.getByTestId("om-error")).toContainText("Choose the courier and enter the tracking number");

      await manager.getByTestId("om-courier").selectOption("JNE");
      await manager.getByTestId("om-tracking").fill("CGK1A26102700077");
      await manager.getByTestId("om-next").click();
      await expect(page.getByText(`${no} shipped with JNE`)).toBeVisible();
      await expect(row.getByTestId("admin-order-status")).toHaveText("Shipped");

      const customer = await browser.newContext({ storageState: CUSTOMER_STATE });
      const mine = await customer.newPage();
      await mine.goto(`/orders/${order_id}`);
      await expect(mine.getByTestId("order-tracking")).toContainText("JNE · resi CGK1A26102700077");
      await customer.close();
    } finally {
      await request.put(`/api/orders/${order_id}`, { data: { order_status: "cancelled" } });
    }
  });
});
