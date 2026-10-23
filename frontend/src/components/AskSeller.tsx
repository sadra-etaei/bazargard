import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Bot, Check, ChevronDown, Copy, MessageSquareText, Phone, PhoneCall, X } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useReport } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import type { Inquiry, InquiryChannel, Shop } from "../lib/types";
import { AlternativesPanel } from "./Alternatives";
import { VisitActions } from "./VisitActions";
import { InquiryLive } from "./InquiryLive";
import { Button, Sheet, Spinner, toast } from "./ui";

export function AskSellerSheet({ open, onClose, shop, offerId, productId }: {
  open: boolean; onClose: () => void; shop: Shop; offerId?: string; productId?: string;
}) {
  const { visitLabel, conditions } = usePrefs();
  const messaging = useQuery({ queryKey: ["messaging"], queryFn: api.messaging, enabled: open, staleTime: 60000 });
  const [outcome, setOutcome] = useState<null | "in_stock" | "out_of_stock" | "price_changed">(null);
  const [price, setPrice] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const report = useReport();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [manual, setManual] = useState(false);
  const start = useMutation({
    mutationFn: (channel: InquiryChannel) =>
      api.ask({ shop_id: shop.shop_id, product_id: productId, offer_id: offerId, visit_label: visitLabel, channel, installments: conditions.installments, torobpay: conditions.torobpay }),
    onSuccess: setInquiry,
  });
  const msg = useQuery({
    queryKey: ["msg", shop.shop_id, offerId, visitLabel, conditions.installments, conditions.torobpay],
    queryFn: () => api.message({ shop_id: shop.shop_id, offer_id: offerId, visit_label: visitLabel,
      installments: conditions.installments, torobpay: conditions.torobpay }),
    enabled: open,
  });

  const send = (status: "in_stock" | "out_of_stock" | "price_changed") => {
    if (report.isPending) return;
    report.reset();
    setOutcome(status);
    if (status === "price_changed") return;
    report.mutate({ shop_id: shop.shop_id, product_id: productId, status, source: "call" });
  };

  const close = () => {
    setOutcome(null);
    setPrice("");
    setInquiry(null);
    setManual(false);
    start.reset();
    report.reset();
    setChecked(new Set());
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title={`استعلام از ${shop.name}`}>
      {msg.isError ? <div role="alert" className="text-sm text-rose-700">دریافت پیام استعلام انجام نشد. <button onClick={() => msg.refetch()} className="underline">تلاش دوباره</button></div> : !msg.data ? <Spinner /> : (
        <>
          <p className="text-sm leading-6 text-slate-500">
            قیمت و موجودی ثبت‌شده در ترب ممکن است با امروز فرق کند. قبل از رفتن بپرسید تا سفر بی‌نتیجه نداشته باشید.
          </p>

          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">{msg.data.note} نام نمایشی و شماره تماس، نشانه تأیید هویت فروشگاه نیست.</div>
          {messaging.data && (messaging.data.sms_simulated || messaging.data.call_simulated) && <p className="mt-2 text-xs leading-6 text-slate-500">{messaging.data.sms_simulated ? "پیامک: حالت آزمایشی؛ پیامی ارسال نمی‌شود. " : ""}{messaging.data.call_simulated ? "تماس خودکار: حالت آزمایشی؛ تماسی برقرار نمی‌شود." : ""}</p>}
          {inquiry ? (
            <div className="mt-3"><InquiryLive initial={inquiry} offerId={offerId} /></div>
          ) : (
            <div className="mt-3 rounded-2xl bg-brand-50 p-3 ring-1 ring-brand-100">
              <div className="flex items-center gap-1.5 text-sm font-bold text-brand-900"><Bot size={16} /> بازارگرد به‌جای شما می‌پرسد</div>
              <div className="mt-1 text-xs leading-5 text-brand-900/80">
                پیامک یا تماس خودکار به فروشنده؛ او با یک لمس یا یک دکمه جواب می‌دهد و نتیجه همین‌جا و روی کارت فروشنده نمایش داده می‌شود.
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button disabled={start.isPending} onClick={() => start.mutate("sms")}><MessageSquareText size={15} /> پیامک خودکار</Button>
                <Button disabled={start.isPending} variant="outline" onClick={() => start.mutate("call")}><PhoneCall size={15} /> تماس خودکار</Button>
              </div>
              {start.isError && <div className="mt-2 text-xs text-rose-700">{start.error.message}</div>}
            </div>
          )}

          <button onClick={() => setManual(!manual)} className="mt-4 flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <span className="flex items-center gap-1.5"><Phone size={15} /> خودم تماس می‌گیرم یا پیام می‌دهم</span>
            <ChevronDown size={16} className={clsx("transition", manual && "rotate-180")} />
          </button>

          {manual && (<>
          <div className="mt-3 whitespace-pre-line rounded-2xl bg-brand-50 p-3 text-sm leading-7 text-brand-900 ring-1 ring-brand-100">{msg.data.text}</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button href={msg.data.links.call || undefined} disabled={!msg.data.links.call}><Phone size={15} /> تماس</Button>
            <Button variant="soft" href={msg.data.links.sms || undefined}><MessageSquareText size={15} /> پیامک</Button>
            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(msg.data!.text); toast.success("متن پیام کپی شد"); }}>
              <Copy size={15} /> کپی
            </Button>
          </div>
          {msg.data.phone && <div className="mt-1.5 text-center text-xs text-slate-400" dir="ltr">{msg.data.phone} · {msg.data.note}</div>}

          <div className="mt-4 text-sm font-bold">چک‌لیست سؤال‌ها پشت تلفن</div>
          <div className="mt-2 space-y-1.5">
            {msg.data.questions.map((q, i) => (
              <button key={q} onClick={() => setChecked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-right text-sm">
                <span className={clsx("flex size-5 shrink-0 items-center justify-center rounded-md ring-1", checked.has(i) ? "bg-brand-700 text-white ring-brand-700" : "bg-surface ring-slate-300")}>
                  {checked.has(i) && <Check size={13} />}
                </span>
                {q}
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 p-3">
            <div className="text-sm font-bold">جواب فروشنده چه بود؟</div>
            <div className="mt-1 text-xs text-slate-500">با ثبت جواب، موجودی برای شما و بقیه «تأییدشده» یا «ناموجود» نمایش داده می‌شود.</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <OutcomeBtn active={outcome === "in_stock"} onClick={() => send("in_stock")} tone="green"><Check size={15} /> موجود است</OutcomeBtn>
              <OutcomeBtn active={outcome === "out_of_stock"} onClick={() => send("out_of_stock")} tone="red"><X size={15} /> ندارد</OutcomeBtn>
              <OutcomeBtn active={outcome === "price_changed"} onClick={() => send("price_changed")} tone="amber">قیمت فرق دارد</OutcomeBtn>
            </div>
            {outcome === "price_changed" && (
              <div className="mt-3 flex gap-2">
                <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d۰-۹]/g, ""))}
                  placeholder="قیمت جدید (تومان)" className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm" />
                <Button disabled={!price || report.isPending} onClick={() => {
                  const n = Number(price.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
                  report.mutate({ shop_id: shop.shop_id, product_id: productId, status: "price_changed", price: n, source: "call" });
                }}>ثبت</Button>
              </div>
            )}
          </div>

          {report.isPending && <p role="status" className="mt-2 text-xs text-slate-500">در حال ثبت پاسخ…</p>}
          {report.isError && <p role="alert" className="mt-2 text-xs text-rose-700">پاسخ ثبت نشد؛ دوباره تلاش کنید. {report.error.message}</p>}
          {outcome === "out_of_stock" && report.isSuccess && productId && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-bold">گزینه‌های جایگزین 👇</div>
              <AlternativesPanel productId={productId} excludeShop={shop.shop_id} compact />
            </div>
          )}
          {outcome === "price_changed" && report.isSuccess && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">قیمت جدید ثبت شد. قیمت به‌تنهایی موجودی همین مدل و رنگ را تأیید نمی‌کند؛ موجودی را هم بپرسید.</div>}
          {outcome === "in_stock" && report.isSuccess && (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">
              پاسخ شما ثبت شد؛ موجودی همین کالا را از طریق تماس گزارش کردید.
              {shop.status.state === "closed" && <p className="mt-2 text-xs text-rose-800">طبق ساعت کاری ثبت‌شده، فروشگاه هنگام رسیدن بسته است؛ زمان مراجعه را هم با فروشنده هماهنگ کنید.</p>}
              <VisitActions shopId={shop.shop_id} productId={productId} offerId={offerId} onClose={close} />
            </div>
          )}
          </>)}
        </>
      )}
    </Sheet>
  );
}

function OutcomeBtn({ children, onClick, active, tone }: { children: React.ReactNode; onClick: () => void; active: boolean; tone: "green" | "red" | "amber" }) {
  return (
    <button onClick={onClick} className={clsx("flex items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-bold ring-1 transition",
      active ? { green: "bg-emerald-600 text-white ring-emerald-600", red: "bg-rose-600 text-white ring-rose-600", amber: "bg-amber-500 text-white ring-amber-500" }[tone]
        : { green: "bg-emerald-50 text-emerald-700 ring-emerald-200", red: "bg-rose-50 text-rose-700 ring-rose-200", amber: "bg-amber-50 text-amber-800 ring-amber-200" }[tone])}>
      {children}
    </button>
  );
}
