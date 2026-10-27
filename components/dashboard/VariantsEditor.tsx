"use client";

import { buttonVariants, cx, inputClasses } from "@/lib/classes";
import type { OptionGroup, Product, VariantInput } from "@/lib/types";

/** The API's limits (routes/products.py VARIANT_LIMITS). */
export const VARIANT_LIMITS = { groups: 3, values: 12, variants: 60, name: 30, value: 40 } as const;

/** One option group while editing: its values as the comma-separated text the admin types. */
export interface GroupDraft {
  name: string;
  values: string;
}

/** One combination's row. `offered` unticked = not sold (removed, or retired if it was ordered). */
export interface VariantDraft {
  variant_id?: number;
  price: string;
  stock_quantity: string;
  image: string;
  offered: boolean;
}

export interface VariantsDraft {
  groups: GroupDraft[];
  /** keyed by comboKey, so a row's edits survive renaming or reordering other values */
  rows: Record<string, VariantDraft>;
}

export const EMPTY_VARIANTS: VariantsDraft = { groups: [], rows: {} };

const splitValues = (text: string) =>
  text
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

/** The groups as the API takes them (blank groups dropped). */
export const parseGroups = (groups: GroupDraft[]): OptionGroup[] =>
  groups.filter((g) => g.name.trim() || g.values.trim()).map((g) => ({ name: g.name.trim(), values: splitValues(g.values) }));

const comboKey = (values: string[]) => values.join("\u0000");

/** Every combination of the groups' values, in order: [{ key, options, label }]. */
export function combinations(groups: OptionGroup[]) {
  let combos: { values: string[] }[] = [{ values: [] }];
  for (const g of groups) combos = combos.flatMap((c) => g.values.map((v) => ({ values: [...c.values, v] })));
  if (!groups.length) return [];
  return combos.map(({ values }) => ({
    key: comboKey(values),
    options: Object.fromEntries(groups.map((g, i) => [g.name, values[i]])) as Record<string, string>,
    label: values.join(" · "),
  }));
}

/** A product's saved variants as an editable draft. */
export function toDraft(p: Pick<Product, "option_groups" | "variants">): VariantsDraft {
  const groups = p.option_groups ?? [];
  const rows: Record<string, VariantDraft> = {};
  for (const v of p.variants ?? []) {
    rows[comboKey(groups.map((g) => v.options[g.name]))] = {
      variant_id: v.variant_id,
      price: String(v.price),
      stock_quantity: String(v.stock_quantity),
      image: v.image ?? "",
      offered: v.is_active,
    };
  }
  return { groups: groups.map((g) => ({ name: g.name, values: g.values.join(", ") })), rows };
}

const rowFor = (draft: VariantsDraft, key: string, fallbackPrice: string): VariantDraft =>
  draft.rows[key] ?? { price: fallbackPrice, stock_quantity: "0", image: "", offered: true };

/** What the product form sends: option_groups + the offered variants (or both empty). */
export function toVariantInput(draft: VariantsDraft, fallbackPrice: string): { option_groups: OptionGroup[]; variants: VariantInput[] } {
  const groups = parseGroups(draft.groups);
  const variants = combinations(groups)
    .map((c) => ({ c, row: rowFor(draft, c.key, fallbackPrice) }))
    .filter(({ row }) => row.offered)
    .map(({ c, row }) => ({
      ...(row.variant_id ? { variant_id: row.variant_id } : {}),
      options: c.options,
      price: Number(row.price),
      stock_quantity: Number(row.stock_quantity),
      image: row.image || null,
      is_active: true,
    }));
  return { option_groups: groups, variants };
}

/** The first problem with the draft, or null. Mirrors the API's checks so mistakes show here first. */
export function validateVariants(draft: VariantsDraft, fallbackPrice: string): string | null {
  const groups = parseGroups(draft.groups);
  if (!groups.length) return null;
  const names = groups.map((g) => g.name.toLowerCase());
  if (groups.some((g) => !g.name || g.name.length > VARIANT_LIMITS.name)) return `Give each option a name (up to ${VARIANT_LIMITS.name} characters).`;
  if (new Set(names).size !== names.length) return "Two options have the same name.";
  for (const g of groups) {
    if (!g.values.length) return `Add values for ${g.name}, separated by commas.`;
    if (g.values.length > VARIANT_LIMITS.values) return `${g.name} can have at most ${VARIANT_LIMITS.values} values.`;
    if (g.values.some((v) => v.length > VARIANT_LIMITS.value)) return `Keep ${g.name} values under ${VARIANT_LIMITS.value} characters.`;
    if (new Set(g.values.map((v) => v.toLowerCase())).size !== g.values.length) return `${g.name} lists a value twice.`;
  }
  const combos = combinations(groups);
  if (combos.length > VARIANT_LIMITS.variants) return `That makes ${combos.length} combinations — the limit is ${VARIANT_LIMITS.variants}.`;
  const offered = combos.filter((c) => rowFor(draft, c.key, fallbackPrice).offered);
  if (!offered.length) return "Tick at least one variant to sell.";
  for (const c of offered) {
    const row = rowFor(draft, c.key, fallbackPrice);
    const price = Number(row.price);
    if (row.price.trim() === "" || Number.isNaN(price) || price < 0) return `${c.label}: enter a price.`;
    const stock = Number(row.stock_quantity);
    if (!Number.isInteger(stock) || stock < 0) return `${c.label}: stock must be a whole number, 0 or more.`;
  }
  return null;
}

/**
 * Variants: options such as Capacity (1TB, 2TB) or Color (Black, White), and a row per
 * combination with its own price, stock and photo. With variants, the product's own price and
 * stock follow from them (lowest price, total stock).
 */
export default function VariantsEditor({
  value,
  onChange,
  images,
  fallbackPrice,
  error,
}: {
  value: VariantsDraft;
  onChange: (next: VariantsDraft) => void;
  images: string[];
  fallbackPrice: string;
  error?: string;
}) {
  const groups = parseGroups(value.groups);
  const combos = combinations(groups);
  const setGroup = (i: number, patch: Partial<GroupDraft>) =>
    onChange({ ...value, groups: value.groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const setRow = (key: string, patch: Partial<VariantDraft>) =>
    onChange({ ...value, rows: { ...value.rows, [key]: { ...rowFor(value, key, fallbackPrice), ...patch } } });

  return (
    <fieldset className="space-y-4 rounded-xl border border-line p-4" data-testid="variants-editor">
      <legend className="px-1 font-mono text-[0.68rem] tracking-[0.16em] text-cyan uppercase">Variants</legend>
      <p className="text-xs text-faint">
        Optional. Add an option such as <span className="text-dim">Capacity</span> (1TB, 2TB, 4TB) or <span className="text-dim">Color</span> (Black, White);
        every combination gets its own price, stock and photo.
      </p>

      {value.groups.map((g, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]" data-testid="variant-group">
          <input
            aria-label={`Option ${i + 1} name`}
            value={g.name}
            maxLength={VARIANT_LIMITS.name}
            onChange={(e) => setGroup(i, { name: e.target.value })}
            placeholder="Capacity"
            className={cx(inputClasses, "text-sm")}
            data-testid="variant-group-name"
          />
          <input
            aria-label={`Option ${i + 1} values, comma separated`}
            value={g.values}
            onChange={(e) => setGroup(i, { values: e.target.value })}
            placeholder="1TB, 2TB, 4TB"
            className={cx(inputClasses, "text-sm")}
            data-testid="variant-group-values"
          />
          <button
            type="button"
            onClick={() => onChange({ ...value, groups: value.groups.filter((_, j) => j !== i) })}
            className="grid size-10 place-items-center rounded-lg border border-line text-xs text-dim hover:border-rose hover:text-rose"
            aria-label={`Remove option ${g.name || i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}

      {value.groups.length < VARIANT_LIMITS.groups && (
        <button
          type="button"
          onClick={() => onChange({ ...value, groups: [...value.groups, { name: "", values: "" }] })}
          className={cx(buttonVariants.ghost, "text-xs")}
          data-testid="variant-add-group"
        >
          + Add option
        </button>
      )}

      {combos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-void/40">
          <table className="w-full min-w-140 text-sm" data-testid="variant-table">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[0.62rem] tracking-[0.14em] text-faint uppercase">
                <th scope="col" className="px-3 py-2 font-normal">Sell</th>
                <th scope="col" className="px-3 py-2 font-normal">Variant</th>
                <th scope="col" className="px-3 py-2 font-normal">Price (IDR)</th>
                <th scope="col" className="px-3 py-2 font-normal">Stock</th>
                <th scope="col" className="px-3 py-2 font-normal">Photo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {combos.map((c) => {
                const row = rowFor(value, c.key, fallbackPrice);
                return (
                  <tr key={c.key} className={cx(!row.offered && "opacity-50")} data-testid="variant-row">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={row.offered} onChange={(e) => setRow(c.key, { offered: e.target.checked })} aria-label={`Sell ${c.label}`} className="size-4 accent-cyan" />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{c.label}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1000}
                        value={row.price}
                        onChange={(e) => setRow(c.key, { price: e.target.value })}
                        aria-label={`${c.label} price`}
                        className={cx(inputClasses, "w-32 px-2.5 py-1.5 font-mono text-xs")}
                        data-testid="variant-price"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={row.stock_quantity}
                        onChange={(e) => setRow(c.key, { stock_quantity: e.target.value })}
                        aria-label={`${c.label} stock`}
                        className={cx(inputClasses, "w-20 px-2.5 py-1.5 font-mono text-xs")}
                        data-testid="variant-stock"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={images.includes(row.image) ? row.image : ""}
                        onChange={(e) => setRow(c.key, { image: e.target.value })}
                        aria-label={`${c.label} photo`}
                        className={cx(inputClasses, "w-32 cursor-pointer px-2 py-1.5 text-xs")}
                      >
                        <option value="">Default</option>
                        {images.map((src, n) => (
                          <option key={src} value={src}>
                            Image {n + 1}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose" id="pf-variants-error" data-testid="pf-error-variants">
          {error}
        </p>
      )}
    </fieldset>
  );
}
