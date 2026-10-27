import { expect, refreshPages, test } from "./fixtures";
import { ADMIN_STATE, CUSTOMER_STATE } from "./global-setup";

/**
 * Product variants: one product, several buyable combinations with their own price and stock -
 * the seeded Samsung 9100 Pro comes in 1TB, 2TB, 4TB and 8TB (sold out). The picked variant goes
 * through cart, checkout and the order, and its own stock moves.
 */
const isLocal = (baseURL?: string) => /localhost|127\.0\.0\.1/.test(baseURL ?? "");
const SAMSUNG = 9;

type Variant = { variant_id: number; options: Record<string, string>; stock_quantity: number };

test.describe("buying a variant", () => {
  test.use({ storageState: CUSTOMER_STATE });

  test("cards say 'from' and send you to the product to choose", async ({ page }) => {
    await page.goto("/products?search=9100");
    const card = page.getByTestId("product-card").filter({ hasText: "Samsung 9100 Pro NVMe" });
    await expect(card.getByTestId("product-price")).toHaveText(/from\s*Rp\s*2\.950\.000/);
    await card.getByTestId("choose-options").click();
    await expect(page).toHaveURL(new RegExp(`/products/${SAMSUNG}$`));
  });

  test("the picker sets price and stock; a sold-out capacity can't be bought", async ({ page }) => {
    await page.goto(`/products/${SAMSUNG}`);
    const picker = page.getByTestId("variant-picker");
    await expect(picker.getByRole("button", { name: "1TB" })).toHaveAttribute("aria-pressed", "true"); // cheapest in stock
    await expect(page.getByTestId("product-detail-price")).toHaveText(/2\.950\.000/);

    await picker.getByRole("button", { name: "2TB" }).click();
    await expect(page.getByTestId("product-detail-price")).toHaveText(/5\.450\.000/);

    const sold = picker.getByRole("button", { name: /8TB/ });
    await expect(sold).toHaveAttribute("data-state", "sold-out");
    await sold.click();
    await expect(page.getByTestId("product-detail-price")).toHaveText(/21\.500\.000/);
    await expect(page.getByTestId("purchase").getByTestId("add-to-cart")).toBeDisabled();
    await expect(page.getByTestId("purchase").getByTestId("add-to-cart")).toHaveText("Sold out");
  });

  test("two capacities are two cart lines, and the order keeps them", async ({ page, request, baseURL }) => {
    test.skip(!isLocal(baseURL), "places an order");
    const variants = (): Promise<Variant[]> => request.get(`/api/products/${SAMSUNG}`).then(async (r) => (await r.json()).variants);
    const stockOf = async (label: string) => (await variants()).find((v) => v.options.Capacity === label)!.stock_quantity;
    const before = { "1TB": await stockOf("1TB"), "2TB": await stockOf("2TB") };
    let orderId: number | undefined;

    try {
      await page.goto(`/products/${SAMSUNG}`);
      const picker = page.getByTestId("variant-picker");
      await page.getByTestId("purchase").getByTestId("add-to-cart").click();
      await expect(page.getByText("1 × Samsung 9100 Pro NVMe (1TB) added to cart")).toBeVisible();
      await picker.getByRole("button", { name: "2TB" }).click();
      await page.getByTestId("purchase").getByTestId("add-to-cart").click();
      await expect(page.getByTestId("cart-count")).toHaveText("2");

      await page.goto("/cart");
      await expect(page.getByTestId("cart-row")).toHaveCount(2);
      await expect(page.getByTestId("cart-variant")).toHaveText(["1TB", "2TB"]);
      await expect(page.getByTestId("cart-total")).toHaveText(/8\.400\.000/);

      await page.getByTestId("checkout-button").click();
      await page.getByTestId("shipping-address").fill("Jl. Playwright No. 9, Jakarta Selatan");
      await page.getByTestId("recipient-phone").fill("+62 812 3456 7890");
      await page.getByTestId("confirm-order").click();
      await expect(page).toHaveURL(/\/orders$/);

      await page.getByTestId("order-row").first().click();
      await expect(page).toHaveURL(/\/orders\/\d+$/);
      orderId = Number(/\/orders\/(\d+)$/.exec(page.url())?.[1]);
      await expect(page.getByTestId("order-item-variant")).toHaveText(["1TB", "2TB"]);
      expect(await stockOf("1TB")).toBe(before["1TB"] - 1);
      expect(await stockOf("2TB")).toBe(before["2TB"] - 1);
    } finally {
      // cancelling puts both back
      if (orderId) await request.put(`/api/orders/${orderId}`, { data: { order_status: "cancelled" } });
      await refreshPages(request, ["catalog"]);
    }
    expect(await stockOf("1TB")).toBe(before["1TB"]);
  });
});

test.describe("the admin editor", () => {
  test.use({ storageState: ADMIN_STATE });

  test("creates a product with a variant per capacity", async ({ page, request, baseURL }) => {
    test.skip(!isLocal(baseURL), "writes to the database");
    const name = `PW Drive ${Date.now().toString(36)}`;
    let id: number | undefined;
    try {
      await page.goto("/dashboard");
      await page.getByTestId("new-product").click();
      const modal = page.getByTestId("create-modal");
      await modal.getByTestId("pf-name").fill(name);
      await modal.getByTestId("pf-category").selectOption({ label: "Memory and Storage" });

      const editor = modal.getByTestId("variants-editor");
      await editor.getByTestId("variant-add-group").click();
      await editor.getByTestId("variant-group-name").fill("Capacity");
      await editor.getByTestId("variant-group-values").fill("1TB, 2TB");
      await expect(editor.getByTestId("variant-row")).toHaveCount(2);
      await expect(modal.getByTestId("pf-price")).toBeDisabled(); // set per variant now

      // a variant without a price is caught before anything is sent
      await modal.getByTestId("pf-submit").click();
      await expect(modal.getByTestId("pf-error-variants")).toHaveText("1TB: enter a price.");

      await editor.getByTestId("variant-price").nth(0).fill("1500000");
      await editor.getByTestId("variant-stock").nth(0).fill("4");
      await editor.getByTestId("variant-price").nth(1).fill("2800000");
      await editor.getByTestId("variant-stock").nth(1).fill("3");
      await modal.getByTestId("pf-submit").click();
      await expect(page.getByText(`Created ${name}`)).toBeVisible();

      const products = await (await request.get(`/api/products?search=${encodeURIComponent(name)}`)).json();
      const created = products[0];
      id = created.product_id;
      expect(created.option_groups).toEqual([{ name: "Capacity", values: ["1TB", "2TB"] }]);
      expect(created.variants.map((v: Variant & { price: number }) => [v.options.Capacity, v.price, v.stock_quantity])).toEqual([
        ["1TB", 1500000, 4],
        ["2TB", 2800000, 3],
      ]);
      expect([created.price, created.stock_quantity]).toEqual([1500000, 7]); // derived: lowest price, total stock
    } finally {
      if (id) await request.delete(`/api/products/${id}`);
      await refreshPages(request, ["catalog"]);
    }
  });
});
