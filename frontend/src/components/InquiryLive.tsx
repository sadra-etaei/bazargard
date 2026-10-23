import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, MessageSquareText, Phone, PhoneCall, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { faNum, toman } from "../lib/format";
import { VisitActions } from "./VisitActions";
import { speak, stopSpeaking } from "../lib/speech";
import type { Inquiry } from "../lib/types";
import { AlternativesPanel } from "./Alternatives";
import { Button } from "./ui";

/** Inquiries currently shown live in a sheet; the global watcher doesn't double-notify these. */
export const liveInquiries = new Set<number>();

export function InquiryLive({ initial, offerId }: { initial: Inquiry; offerId?: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["inquiry", initial.id],
    queryFn: () => api.inquiry(initial.id),
    initialData: initial,
    refetchInterval: (query) => (query.state.data?.status === "sent" ? 2000 : false),
  });
  const inq = q.data;

  useEffect(() => {
    liveInquiries.add(initial.id);
    return () => {
      liveInquiries.delete(initial.id);
    };
  }, [initial.id]);

  // When the seller answers, every card, trip and alternatives list should reflect it.
  const handled = useRef(false);
  useEffect(() => {
    if (inq.status === "answered" && !handled.current) {
      handled.current = true;
      stopSpeaking();
      api.inquirySeen(inq.id);
      qc.invalidateQueries({ queryKey: ["product"] });
      qc.invalidateQueries({ queryKey: ["search"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["alt"] });
      qc.invalidateQueries({ queryKey: ["my-inquiries"] });
    }
  }, [inq.status, inq.id, qc]);

  return (
    <div className="space-y-3">
      {inq.status === "failed" ? (
        <div className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
          <div className="font-bold">{inq.simulated ? "استعلام آزمایشی؛ ارتباط واقعی برقرار نشد" : inq.channel === "call" ? "تماس برقرار نشد" : "پیامک ارسال نشد"}</div>
          <div className="mt-1 text-xs leading-5">{inq.error}</div>
          <div className="mt-1 text-xs leading-5 opacity-80">موجودی و قیمت امروز تأیید نشد؛ می‌توانید خودتان تماس بگیرید یا گزینه‌های دیگر را ببینید.</div>
          {inq.shop_phone && <Button href={`tel:${inq.shop_phone}`} size="sm" className="mt-2"><Phone size={14} /> خودم تماس می‌گیرم</Button>}
        </div>
      ) : inq.channel === "call" ? (
        <CallCard inq={inq} />
      ) : (
        <SmsCard inq={inq} />
      )}

      {inq.status === "answered" && inq.answer && (
        <div className={clsx("animate-fadein rounded-2xl p-4 ring-1", {
          in_stock: "bg-emerald-50 text-emerald-900 ring-emerald-200",
          out_of_stock: "bg-rose-50 text-rose-900 ring-rose-200",
          price_changed: "bg-amber-50 text-amber-900 ring-amber-200",
        }[inq.answer])}>
          <div className="flex items-center gap-2 text-base font-extrabold">
            {inq.answer === "out_of_stock" ? <X size={18} /> : <Check size={18} />}
            فروشنده پاسخ داد: {inq.summary}
          </div>
          {inq.answer === "price_changed" && inq.listed_price && inq.answer_price && (
            <div className="mt-1 text-xs">قیمت ثبت‌شده در ترب {toman(inq.listed_price)} بود؛ قیمت امروز {toman(inq.answer_price)}.</div>
          )}
          {inq.answer === "price_changed" && <p className="mt-1 text-xs">قیمت جدید اعلام شده؛ موجودی مدل و رنگ موردنظر را جداگانه بپرسید.</p>}
          {inq.answer_note && <div className="mt-1 text-xs">«{inq.answer_note}»</div>}
          <div className="mt-1 text-[11px] opacity-70">این پاسخ روی کارت فروشنده برای شما و بقیه خریداران «تأیید فروشنده» نمایش داده می‌شود.</div>
          {inq.answer !== "out_of_stock" && (
            <VisitActions shopId={inq.shop_id} productId={inq.product_id} offerId={offerId} />
          )}
        </div>
      )}
      {inq.status === "answered" && inq.answer === "out_of_stock" && inq.product_id && (
        <div>
          <div className="mb-2 text-sm font-bold">گزینه‌های جایگزین 👇</div>
          <AlternativesPanel productId={inq.product_id} excludeShop={inq.shop_id} compact />
        </div>
      )}
      {(inq.status === "failed" || inq.status === "expired") && inq.product_id && (
        <div>
          <div className="mb-2 text-sm font-bold">گزینه‌های دیگر 👇</div>
          <AlternativesPanel productId={inq.product_id} excludeShop={inq.shop_id} compact />
        </div>
      )}
      {inq.status === "expired" && <div className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-600">{inq.summary}</div>}
    </div>
  );
}

function SmsCard({ inq }: { inq: Inquiry }) {
  return (
    <div className="rounded-2xl bg-surface p-3 ring-1 ring-slate-200">
      <div className="flex items-center gap-2 text-sm font-bold">
        <MessageSquareText size={16} className="text-brand-700" />
        {inq.simulated ? "نمایش آزمایشی پیامک؛ ارسال واقعی انجام نشده" : `پیامک برای ${inq.shop_name} ارسال شد`}
        {inq.receptor && <span className="text-[11px] font-normal text-slate-400" dir="ltr">{faNum(inq.receptor)}</span>}
      </div>
      <div className="mt-2 rounded-2xl rounded-tr-md bg-slate-100 p-3 text-[13px] leading-6 whitespace-pre-line text-slate-800">{inq.message}</div>
      <Waiting inq={inq} />
    </div>
  );
}

function CallCard({ inq }: { inq: Inquiry }) {
  const [seconds, setSeconds] = useState(0);
  const [voice, setVoice] = useState<boolean | null>(null);
  const active = inq.status === "sent";
  useEffect(() => {
    if (!active || inq.simulated) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  useEffect(() => {
    if (inq.simulated) return;
    setVoice(speak(inq.message));
    return () => stopSpeaking();
  }, [inq.message]);

  return (
    <div className="overflow-hidden rounded-2xl bg-inverse p-4 text-white">
      <div className="flex items-center gap-3">
        <div className={clsx("flex size-11 items-center justify-center rounded-full", active ? "animate-pulse bg-emerald-500" : "bg-slate-600")}>
          <PhoneCall size={20} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold">{inq.simulated ? "نمایش آزمایشی تماس؛ تماس واقعی انجام نشده" : active ? "تماس خودکار در جریان است" : "تماس پایان یافت"}</div>
          <div className="text-xs text-white/55">{inq.shop_name} {inq.receptor && <span dir="ltr">· {faNum(inq.receptor)}</span>}</div>
        </div>
        <div className="font-mono text-sm text-white/70" dir="ltr">
          {faNum(String(Math.floor(seconds / 60)).padStart(2, "0"))}:{faNum(String(seconds % 60).padStart(2, "0"))}
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-white/5 p-3 text-[12.5px] leading-6 text-white/85">{inq.message}</div>
      {voice === false && <div className="mt-1 text-[11px] text-white/55">(صدای فارسی روی این دستگاه نیست؛ متن تماس بالا نمایش داده شده است.)</div>}
      {active && !inq.simulated && <div className="mt-2 text-xs text-emerald-300">منتظر انتخاب فروشنده روی صفحه‌کلید…</div>}
    </div>
  );
}

function Waiting({ inq }: { inq: Inquiry }) {
  if (inq.status !== "sent") return null;
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
      <span className="flex gap-1">
        {[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${d * 120}ms` }} />)}
      </span>
      منتظر پاسخ فروشنده… به‌محض پاسخ، همین‌جا و روی کارت فروشنده نمایش داده می‌شود.
    </div>
  );
}
