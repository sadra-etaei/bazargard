import { Building2, Copy, MapPin } from "lucide-react";
import { faNum } from "../lib/format";
import type { Shop } from "../lib/types";
import { StoreNeighbors } from "./StoreNeighbors";
import { Button, Sheet, toast } from "./ui";

export function NavSheet({ open, onClose, shop }: { open: boolean; onClose: () => void; shop: Shop }) {
  return (
    <Sheet open={open} onClose={onClose} title={`مسیر تا ${shop.name}`}>
      <div className="rounded-2xl bg-slate-50 p-3 text-sm leading-7">
        <div className="flex items-start gap-2"><MapPin size={16} className="mt-1.5 shrink-0 text-brand-700" />{shop.address || "آدرس ثبت نشده"}</div>
        {shop.mall && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-surface p-2.5 font-bold ring-1 ring-slate-900/[0.06] shadow-card">
            <Building2 size={16} className="text-brand-700" />
            {shop.mall}
            {shop.floor_label && <span className="rounded-lg bg-brand-50 px-2 text-brand-800">{faNum(shop.floor_label)}</span>}
            {shop.unit && <span className="rounded-lg bg-amber-50 px-2 text-amber-800">واحد {faNum(shop.unit)}</span>}
          </div>
        )}
      </div>
      <StoreNeighbors shop={shop} enabled={open} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {shop.nav.neshan && <Button href={shop.nav.neshan} variant="outline">نشان</Button>}
        {shop.nav.balad && <Button href={shop.nav.balad} variant="outline">بلد</Button>}
        {shop.nav.google && <Button href={shop.nav.google} variant="outline">گوگل‌مپ</Button>}
      </div>
      <Button variant="ghost" className="mt-2 w-full" onClick={() => {
        navigator.clipboard?.writeText([shop.name, shop.address].filter(Boolean).join(" — "));
        toast.success("آدرس کپی شد");
      }}>
        <Copy size={15} /> کپی آدرس
      </Button>
    </Sheet>
  );
}
