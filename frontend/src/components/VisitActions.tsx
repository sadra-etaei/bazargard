import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { usePrefs } from "../lib/store";
import { Button } from "./ui";

/** Both confirmations and saved lists lead to the same persisted guide. */
export function VisitActions({ shopId, productId, offerId, onClose }: {
  shopId: string; productId?: string; offerId?: string; onClose?: () => void;
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (go: boolean) => ({ visit: await api.addVisit({ shop_id: shopId, product_id: productId, offer_id: offerId }), go }),
    onSuccess: ({ visit, go }) => {
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      if (go) {
        const state = usePrefs.getState();
        state.set({ visitAt: null, visitLabel: null, journey: { ...state.journey, activeVisitId: visit.id, step: 1,
          total: 0, outcomes: [], cachedPlan: null, cacheKey: "", savedAt: null } });
      }
      onClose?.();
      nav(go ? "/go" : "/trip");
    },
  });
  return <div className="mt-3 space-y-2">
    <div className="grid grid-cols-2 gap-2">
      <Button disabled={save.isPending} onClick={() => save.mutate(true)}>رفتن به این فروشگاه</Button>
      <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate(false)}>افزودن به مسیر</Button>
    </div>
    {save.isError && <p role="alert" className="text-xs text-rose-700">ذخیره نشد: {save.error.message}</p>}
  </div>;
}
