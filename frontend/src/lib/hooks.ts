import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "../components/ui";
import { api } from "./api";
import { contextFilters, usePrefs } from "./store";
import type { Filters } from "./types";

/** Location, visit time, travel mode and standing purchase conditions — sent with every request. */
export function useCtx(): Filters {
  const p = usePrefs(useShallow((s) => ({
    location: s.location, radius: s.radius, visitAt: s.visitAt, visitLabel: s.visitLabel, mode: s.mode,
    priority: s.priority, conditions: s.conditions, includeUnknown: s.includeUnknown, searchScope: s.searchScope,
  })));
  return useMemo(() => contextFilters(p as never), [p]);
}

export function useAddVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.addVisit,
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      toast.success("به مسیر خرید اضافه شد", { action: { label: "دیدن مسیر", to: "/trip" } });
    },
  });
}

export function useReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.report,
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("ثبت شد؛ به بقیه خریداران هم کمک کردی", { title: "ممنون 🙏" });
    },
  });
}

/** True when the viewport is at least `px` wide; updates on resize. */
export function useMinWidth(px: number) {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
