import { existsSync, readFileSync } from "node:fs";

const c = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const idr = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const errors = [];

const catIds = new Set(c.categories.map((x) => x.category_id));
const prodIds = new Set(c.products.map((x) => x.product_id));
const userIds = new Set(c.users.map((x) => x.id));
const slugs = new Set(c.products.map((x) => x.slug));
const STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"];
const variantIds = { seen: new Set(), add(id) { if (this.seen.has(id)) return false; this.seen.add(id); return true; } };

if (slugs.size !== c.products.length) errors.push("duplicate slug");
if (prodIds.size !== c.products.length) errors.push("duplicate product_id");

for (const p of c.products) {
  if (!catIds.has(p.category_id)) errors.push(`product ${p.product_id}: unknown category ${p.category_id}`);
  if (p.price < 0) errors.push(`product ${p.product_id}: negative price`);
  if (p.stock_quantity < 0) errors.push(`product ${p.product_id}: negative stock`);
  if (!/^[a-z0-9-]+$/.test(p.slug)) errors.push(`product ${p.product_id}: bad slug ${p.slug}`);
  if (!Array.isArray(p.images) || p.images.length === 0 || p.images.length > 12) errors.push(`product ${p.product_id}: needs 1 to 12 images`);
  for (const img of p.images ?? []) {
    if (!existsSync(new URL(`../assets${img}`, import.meta.url))) errors.push(`product ${p.product_id}: missing ${img}`);
  }
  // variants: one value per option group, unique combinations, and the product's own price and
  // stock equal to what the API derives (lowest active variant price, total active stock)
  const groups = p.option_groups ?? [];
  const variants = p.variants ?? [];
  if (groups.length && !variants.length) errors.push(`product ${p.product_id}: option groups but no variants`);
  if (!groups.length && variants.length) errors.push(`product ${p.product_id}: variants without option groups`);
  const combos = new Set();
  for (const v of variants) {
    if (!variantIds.add(v.variant_id)) errors.push(`product ${p.product_id}: duplicate variant_id ${v.variant_id}`);
    const key = groups.map((g) => v.options[g.name]).join("|");
    if (Object.keys(v.options).length !== groups.length || groups.some((g) => !g.values.includes(v.options[g.name]))) {
      errors.push(`product ${p.product_id}: variant ${v.variant_id} options don't match the groups`);
    }
    if (combos.has(key)) errors.push(`product ${p.product_id}: combination ${key} twice`);
    combos.add(key);
    if (v.price < 0 || v.stock_quantity < 0) errors.push(`product ${p.product_id}: variant ${v.variant_id} negative price or stock`);
    if (v.image && !(p.images ?? []).includes(v.image)) errors.push(`product ${p.product_id}: variant ${v.variant_id} photo is not one of its images`);
  }
  const active = variants.filter((v) => v.is_active);
  if (active.length) {
    if (p.price !== Math.min(...active.map((v) => v.price))) errors.push(`product ${p.product_id}: price should be the lowest variant price`);
    if (p.stock_quantity !== active.reduce((n, v) => n + v.stock_quantity, 0)) errors.push(`product ${p.product_id}: stock should be the variants' total`);
  }
}

let itemCount = 0;
for (const o of c.orders) {
  if (!userIds.has(o.user_id)) errors.push(`order ${o.order_id}: unknown user`);
  else if (c.users.find((u) => u.id === o.user_id).role !== "customer") errors.push(`order ${o.order_id}: only customers place orders`);
  if (["shipped", "delivered"].includes(o.order_status) && !(o.courier && o.tracking_number)) {
    errors.push(`order ${o.order_id}: shipped orders need a courier and tracking number`);
  }
  if (!STATUSES.includes(o.order_status)) errors.push(`order ${o.order_id}: bad status`);
  if (o.items.length === 0) errors.push(`order ${o.order_id}: empty items`);
  const seen = new Set();
  for (const i of o.items) {
    itemCount++;
    if (!prodIds.has(i.product_id)) errors.push(`order ${o.order_id}: unknown product ${i.product_id}`);
    const line = `${i.product_id}:${i.variant_id ?? ""}`;
    if (seen.has(line)) errors.push(`order ${o.order_id}: duplicate line ${line}`);
    seen.add(line);
    const p = c.products.find((x) => x.product_id === i.product_id);
    if (!p) continue;
    if (p.option_groups?.length) {
      const v = p.variants.find((x) => x.variant_id === i.variant_id);
      if (!v) errors.push(`order ${o.order_id}: ${p.product_name} needs a variant`);
      else if (v.price !== i.unit_price) errors.push(`order ${o.order_id}: unit_price ${i.unit_price} != variant price ${v.price} for ${p.product_name}`);
    } else if (p.price !== i.unit_price) {
      errors.push(`order ${o.order_id}: unit_price ${i.unit_price} != product price ${p.price} for ${p.product_name}`);
    }
  }
}

console.log(`categories ${c.categories.length} | products ${c.products.length} | users ${c.users.length} | orders ${c.orders.length} | order_items ${itemCount}`);
console.log(`admins: ${c.users.filter((u) => u.role === "admin").map((u) => u.email).join(", ")}`);
console.log(`inactive products: ${c.products.filter((p) => !p.is_active).map((p) => p.product_name).join(", ") || "none"}`);
console.log(`low stock (<10): ${c.products.filter((p) => p.stock_quantity < 10).map((p) => `${p.product_name} (${p.stock_quantity})`).join(", ")}`);
console.log("");
for (const o of c.orders) {
  const total = o.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  console.log(`  order ${o.order_id}  ${o.order_status.padEnd(10)} ${o.items.length} items  ${idr(total)}`);
}
const revenue = c.orders.filter((o) => o.order_status !== "cancelled").reduce((s, o) => s + o.items.reduce((t, i) => t + i.quantity * i.unit_price, 0), 0);
console.log(`\nrevenue excl. cancelled: ${idr(revenue)}`);
console.log(`catalog value: ${idr(c.products.reduce((s, p) => s + p.price * p.stock_quantity, 0))}`);

if (errors.length) { console.error("\nFAILED:\n" + errors.map((e) => "  - " + e).join("\n")); process.exit(1); }
console.log("\nvalidation: OK");
