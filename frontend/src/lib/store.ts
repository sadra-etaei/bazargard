import type { SellerSelection } from "./sellerComparison";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { EMPTY_SEARCH_SCOPE, mergeSearchScope, type SearchScope } from "./shoppingContext";
import type { AssistantReply, Filters, ProductSummary, Journey } from "./types";

export interface UserLocation {
  lat: number;
  lon: number;
  label: string;
  source: "gps" | "place" | "map";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  reply?: AssistantReply;
}

interface Prefs {
  deviceId: string;
  location: UserLocation | null;
  radius: number | null;
  visitAt: string | null; // ISO; null = now
  visitLabel: string | null;
  mode: "taxi" | "walk" | "metro";
  conditions: { installments: boolean; torobpay: boolean; warranty: boolean; open: boolean; fast: boolean };
  priority: "balanced" | "price" | "near" | "reliable";
  compare: ProductSummary[];
  sellerComparison: SellerSelection | null;
  searchScope: SearchScope;
  chat: ChatMessage[];
  chatState: Record<string, unknown>;
  recent: string[];
  onboarded: boolean;
  includeUnknown: boolean;
  journey: Journey;
  theme: "system" | "light" | "dark";
  set: (p: Partial<Prefs>) => void;
  toggleCompare: (p: ProductSummary) => void;
  addRecent: (q: string) => void;
  setSearchScope: (filters: Filters) => void;
  applyShoppingFilters: (filters: Filters) => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const k = "__t";
    localStorage.setItem(k, k);
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
});

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const usePrefs = create<Prefs>()(
  persist(
    (set, get) => ({
      deviceId: newId(),
      location: null,
      radius: null,
      visitAt: null,
      visitLabel: null,
      mode: "taxi",
      conditions: { installments: false, torobpay: false, warranty: false, open: false, fast: false },
      priority: "balanced",
      compare: [],
      sellerComparison: null,
      searchScope: { ...EMPTY_SEARCH_SCOPE },
      chat: [],
      chatState: {},
      recent: [],
      onboarded: false,
      includeUnknown: false,
      journey: { activeVisitId: null, step: 0, total: 0, outcomes: [], cachedPlan: null, cacheKey: "", savedAt: null },
      theme: "system",
      set: (p) => set(p),
      setSearchScope: (filters) => set({ searchScope: mergeSearchScope(get().searchScope, filters) }),
      applyShoppingFilters: (filters) => {
        const state = get();
        const patch: Partial<Prefs> = { searchScope: mergeSearchScope(state.searchScope, filters) };
        const conditions = { ...state.conditions };
        for (const key of ["open", "installments", "torobpay", "warranty", "fast"] as const) {
          if (filters[key] !== undefined) conditions[key] = !!filters[key];
        }
        patch.conditions = conditions;
        if (filters.priority) patch.priority = filters.priority;
        if (filters.mode) patch.mode = filters.mode;
        if (filters.include_unknown !== undefined) patch.includeUnknown = filters.include_unknown;
        if (filters.radius !== undefined) patch.radius = filters.radius;
        if (Object.prototype.hasOwnProperty.call(filters, "visit_at")) {
          patch.visitAt = filters.visit_at || null; patch.visitLabel = filters.visit_label || null;
        }
        if (filters.lat !== undefined && filters.lon !== undefined) {
          if (filters.lat === null || filters.lon === null) patch.location = null;
          else if (!state.location || state.location.lat !== filters.lat || state.location.lon !== filters.lon) {
            patch.location = { lat: filters.lat, lon: filters.lon, label: filters.area || "نقطه انتخابی", source: "place" };
          }
        }
        set(patch);
      },
      toggleCompare: (p) => {
        const list = get().compare;
        set({
          compare: list.some((x) => x.product_id === p.product_id)
            ? list.filter((x) => x.product_id !== p.product_id)
            : [...list, p].slice(-3),
        });
      },
      addRecent: (q) => set({ recent: [q, ...get().recent.filter((x) => x !== q)].slice(0, 6) }),
    }),
    { name: "bazargard", storage: safeStorage, version: 1,
      merge: (persisted, current) => {
        const saved = persisted as Partial<Prefs>;
        return { ...current, ...saved, searchScope: mergeSearchScope(EMPTY_SEARCH_SCOPE, saved.searchScope || (saved.chatState?.filters as Filters) || {}) };
      },
    },
  ),
);

/** Filters every request carries: where the user is, when they go, and their standing conditions. */
export function contextFilters(p: Prefs): Filters {
  return {
    ...p.searchScope,
    area: p.location?.label ?? null,
    lat: p.location?.lat ?? null,
    lon: p.location?.lon ?? null,
    radius: p.radius,
    visit_at: p.visitAt,
    visit_label: p.visitLabel,
    mode: p.mode,
    priority: p.priority,
    ...p.conditions,
    include_unknown: p.includeUnknown,
  };
}
