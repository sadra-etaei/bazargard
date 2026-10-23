import type { Filters } from "./types";

export const SCOPE_KEYS = ["q", "category", "brand", "mall", "budget_min", "budget_max", "sort"] as const;
export interface SearchScope {
  q: string; category: string | null; brand: string | null; mall: string | null;
  budget_min: number | null; budget_max: number | null; sort: Filters["sort"];
}
export const EMPTY_SEARCH_SCOPE: SearchScope = { q: "", category: null, brand: null, mall: null, budget_min: null, budget_max: null, sort: "relevance" };

/** Only explicitly supplied keys change. Null is an intentional removal. */
export function mergeSearchScope(current: SearchScope, incoming: Filters): SearchScope {
  const result = { ...current };
  for (const key of SCOPE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
    const value = incoming[key];
    if (key === "budget_min" || key === "budget_max") {
      const number = value === null || value === "" || value === undefined ? NaN : Number(value);
      result[key] = Number.isFinite(number) && number > 0 ? Math.round(number) : null;
    } else if (key === "q") result.q = String(value || "").trim();
    else if (key === "sort") result.sort = ["relevance", "near", "price_asc", "price_desc"].includes(String(value)) ? value as SearchScope["sort"] : "relevance";
    else result[key] = typeof value === "string" && value.trim() ? value.trim() : null;
  }
  return result;
}

export function scopeFromParams(params: URLSearchParams, current: SearchScope): SearchScope {
  const incoming: Filters = {};
  for (const key of SCOPE_KEYS) {
    if (!params.has(key)) continue;
    const value = params.get(key);
    (incoming as Record<string, unknown>)[key] = key.startsWith("budget") ? value ? Number(value) : null : value;
  }
  if (incoming.q !== undefined && incoming.q !== current.q) {
    // A new item may have a different category/brand; budget and mall remain deliberate constraints.
    if (!params.has("category")) incoming.category = null;
    if (!params.has("brand")) incoming.brand = null;
  }
  return mergeSearchScope(current, incoming);
}

export function parseBudgetInput(value: string): number | null {
  const digits = value.replace(/[۰-۹]/g, c => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g, c => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/[^0-9]/g, "");
  const number = Number(digits);
  return digits && Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Saved conversation metadata must never revive conditions the shopper has cleared. */
export function conversationFilters(previous: Filters, current: Filters, extra: Filters = {}): Filters {
  return { ...previous, ...current, ...extra };
}
