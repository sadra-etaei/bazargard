import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, PhoneCall } from "lucide-react";
import { Link } from "react-router-dom";
import { Purchases } from "../components/Purchases";
import { Badge, Empty, Section, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { faNum, timeAgo, toman } from "../lib/format";

const TONE = { in_stock: "green", out_of_stock: "red", price_changed: "amber", shop_closed: "stone" } as const;

export default function Activity() {
  const reports = useQuery({ queryKey: ["my-reports"], queryFn: api.myReports });
  const visits = useQuery({ queryKey: ["visits"], queryFn: api.visits });
  const inquiries = useQuery({
    queryKey: ["my-inquiries"],
    queryFn: () => api.inquiries(),
    refetchInterval: (query) => (query.state.data?.some((i) => i.status === "sent") ? 4000 : false),
  });
  const bought = (visits.data || []).filter((v) => v.state === "bought");
  const saved = bought.reduce((sum, v) => sum + (v.listed_price && v.paid_price && v.paid_price < v.listed_price ? v.listed_price - v.paid_price : 0), 0);

  return (
    <div className="px-4 pt-4 lg:px-0 lg:pt-6">
      <h1 className="text-xl font-extrabold">پیگیری</h1>
      <p className="mt-1 text-xs leading-5 text-slate-500">استعلام‌ها و خریدهای شما. گزارش‌های موجودی به بقیه خریداران هم نشان داده می‌شود (۷۲ ساعت).</p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Box label="استعلام" value={faNum((reports.data?.length ?? 0) + (inquiries.data?.length ?? 0))} />
        <Box label="خرید" value={faNum(bought.length)} />
        <Box label="چانه‌زنی موفق" value={saved ? toman(saved) : "—"} />
      </div>

      <Purchases items={bought} />

      <Section title="پرسش از فروشنده‌ها (پیامک و تماس خودکار)">
        {inquiries.data?.length === 0 && <Empty icon="💬" title="هنوز از فروشنده‌ای نپرسیده‌اید">در کارت هر فروشنده «استعلام» را بزنید؛ بازارگرد به‌جای شما می‌پرسد.</Empty>}
        <div className="grid gap-2 md:grid-cols-2">
          {inquiries.data?.map((i) => (
            <div key={i.id} className="rounded-2xl bg-surface p-3 ring-1 ring-slate-900/[0.06] shadow-card">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
                  {i.channel === "call" ? <PhoneCall size={14} className="shrink-0 text-brand-700" /> : <MessageSquareText size={14} className="shrink-0 text-brand-700" />}
                  <Link to={`/s/${i.shop_id}`} className="truncate">{i.shop_name}</Link>
                </span>
                <Badge tone={i.status === "answered" ? (TONE[i.answer as keyof typeof TONE] ?? "stone") : i.status === "sent" ? "blue" : i.status === "failed" ? "amber" : "stone"}>
                  {i.status === "answered" ? i.summary : i.status_label}
                </Badge>
              </div>
              {i.product_title && <Link to={`/p/${i.product_id}`} className="mt-0.5 line-clamp-1 block text-xs text-slate-600">{i.product_title}</Link>}
              <div className="mt-1 text-[11px] text-slate-400">
                {i.channel === "call" ? "تماس خودکار" : "پیامک"} · {timeAgo(i.created_at)}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="استعلام‌ها و گزارش‌های من">
        {reports.isLoading && <Skeleton className="h-32" />}
        {reports.data?.length === 0 && <Empty icon="📞" title="هنوز استعلامی ثبت نکرده‌اید">بعد از تماس با فروشنده، جوابش را ثبت کنید تا موجودی «تأییدشده» شود.</Empty>}
        <div className="grid gap-2 md:grid-cols-2">
          {reports.data?.map((r) => (
            <div key={r.id} className="rounded-2xl bg-surface p-3 ring-1 ring-slate-900/[0.06] shadow-card">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/s/${r.shop_id}`} className="truncate text-sm font-bold">{r.shop_name}</Link>
                <Badge tone={TONE[r.status as keyof typeof TONE] ?? "stone"}>{r.status_label}</Badge>
              </div>
              {r.product_title && <Link to={`/p/${r.product_id}`} className="mt-0.5 line-clamp-1 block text-xs text-slate-600">{r.product_title}</Link>}
              <div className="mt-1 text-[11px] text-slate-400">{r.source} · {timeAgo(r.created_at)}{r.price ? ` · ${toman(r.price)}` : ""}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

const Box = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-surface p-2.5 ring-1 ring-slate-900/[0.06] shadow-card">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className="text-sm font-extrabold">{value}</div>
  </div>
);
