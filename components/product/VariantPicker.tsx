"use client";

import { useVariantSelection } from "@/components/product/VariantSelection";
import { cx } from "@/lib/classes";
import type { Product } from "@/lib/types";
import { activeVariants, optionState } from "@/lib/variants";

/**
 * One chip row per option group (Capacity, Color...). A value that is sold out in the current
 * combination is struck through but still selectable (so its price shows); a value no variant
 * has at all is disabled.
 */
export default function VariantPicker({ product }: { product: Product }) {
  const selection = useVariantSelection();
  if (!selection || !product.option_groups?.length) return null;
  const { choices, choose } = selection;
  const offered = activeVariants(product);

  return (
    <div className="space-y-4" data-testid="variant-picker">
      {product.option_groups.map((group) => (
        <fieldset key={group.name} className="space-y-2">
          <legend className="font-mono text-[0.68rem] tracking-[0.16em] text-faint uppercase">
            {group.name}: <span className="text-ink normal-case">{choices[group.name] ?? "—"}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const state = optionState(product, choices, group.name, value);
              const exists = offered.some((v) => v.options[group.name] === value);
              const selected = choices[group.name] === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!exists}
                  aria-pressed={selected}
                  onClick={() => choose(group.name, value)}
                  className={cx(
                    "min-w-14 rounded-xl border px-3.5 py-2 font-mono text-sm transition",
                    selected
                      ? "border-cyan bg-cyan/10 text-cyan shadow-[0_0_16px_-6px_var(--color-cyan)]"
                      : "border-line-bright text-dim hover:border-cyan hover:text-ink",
                    state === "sold-out" && "line-through decoration-rose/70",
                    !exists && "cursor-not-allowed opacity-35 hover:border-line-bright hover:text-dim"
                  )}
                  data-testid="variant-option"
                  data-state={state}
                >
                  {value}
                  {state === "sold-out" && <span className="sr-only"> (sold out)</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
