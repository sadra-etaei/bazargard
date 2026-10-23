import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Delete, PhoneIncoming, Volume2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { faNum, timeAgo, toman } from "../lib/format";
import { speak, stopSpeaking } from "../lib/speech";
import type { SellerInquiry, StockAnswer } from "../lib/types";

const ANSWER_TEXT: Record<StockAnswer, string> = {
  in_stock: "موجود است",
  out_of_stock: "موجود نیست",
  price_changed: "قیمت تغییر کرده",
};

/** Public page the seller opens from the SMS link — or the keypad of a (simulated) automatic call. */
export default function SellerReply() {
  const { token = "" } = useParams();
  const q = useQuery({ queryKey: ["seller", token], queryFn: () => api.sellerInquiry(token), retry: false });

  return (
    <div className="min-h-dvh bg-paper px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-2">
          <img src="/icon.svg" alt="" className="size-8" />
          <div>
            <div className="font-extrabold">بازارگرد</div>
            <div className="text-[11px] text-slate-500">استعلام خرید حضوری از طرف یک مشتری</div>
          </div>
        </div>
        {q.isLoading && <Spinner />}
        {q.isError && (
          <div className="rounded-2xl bg-surface p-6 text-center text-sm text-slate-600">این لینک معتبر نیست یا مهلت پاسخ به آن تمام شده است.</div>
        )}
        {q.data && (q.data.channel === "call" ? <Keypad token={token} inq={q.data} /> : <SmsReply token={token} inq={q.data} />)}
      </div>
    </div>
  );
}

function ItemCard({ inq }: { inq: SellerInquiry }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface p-3">
      {inq.image && <img src={inq.image} alt="" className="size-20 shrink-0 rounded-xl bg-slate-50 object-contain" />}
      <div className="min-w-0">
        <div className="text-sm leading-6 font-bold">{inq.item}</div>
        {inq.listed_price && <div className="mt-1 text-xs text-slate-500">قیمت ثبت‌شده شما: <b className="text-slate-800">{toman(inq.listed_price)}</b></div>}
        <div className="mt-1 text-[11px] text-slate-400">
          {inq.shop_name} · {timeAgo(inq.asked_at)}{inq.visit_label ? ` · مراجعه: ${inq.visit_label}` : ""}
        </div>
      </div>
    </div>
  );
}

function Done({ inq }: { inq: SellerInquiry }) {
  return (
    <div className="rounded-2xl bg-emerald-50 p-4 text-center text-emerald-900 ring-1 ring-emerald-200">
      <div className="text-lg font-extrabold">ممنون! پاسخ شما ثبت شد ✓</div>
      <div className="mt-1 text-sm">
        «{inq.answer && ANSWER_TEXT[inq.answer]}{inq.answer_price ? ` — ${toman(inq.answer_price)}` : ""}» همین الان برای مشتری نمایش داده شد.
      </div>
    </div>
  );
}

function SmsReply({ token, inq }: { token: string; inq: SellerInquiry }) {
  const [state, setState] = useState(inq);
  const [mode, setMode] = useState<null | "price">(null);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: (a: { status: StockAnswer; price?: number | null }) => api.sellerAnswer(token, { ...a, note }),
    onSuccess: setState,
  });
  const answered = state.status === "answered";

  return (
    <div className="space-y-3">
      <div className="text-base leading-8">سلام 👋 یک مشتری می‌خواهد حضوری از شما خرید کند و می‌پرسد این کالا موجود است؟</div>
      <ItemCard inq={state} />
      {answered && <Done inq={state} />}
      {state.can_answer && (
        <>
          {answered && <div className="pt-2 text-xs text-slate-500">اگر وضعیت تغییر کرد، دوباره انتخاب کنید:</div>}
          <div className="grid gap-2">
            <button disabled={send.isPending} onClick={() => send.mutate({ status: "in_stock" })}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-bold text-white active:scale-[0.98]">
              <Check size={20} /> بله، موجود است
            </button>
            <button disabled={send.isPending} onClick={() => send.mutate({ status: "out_of_stock" })}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-rose-600 text-base font-bold text-white active:scale-[0.98]">
              <X size={20} /> موجود نیست
            </button>
            <button onClick={() => setMode(mode === "price" ? null : "price")}
              className="flex h-12 items-center justify-center rounded-2xl bg-surface text-sm font-bold text-slate-800 ring-1 ring-slate-200">
              موجود است ولی قیمت تغییر کرده
            </button>
          </div>
          {mode === "price" && (
            <div className="flex gap-2">
              <input inputMode="numeric" value={price} dir="ltr" placeholder="قیمت امروز (تومان)"
                onChange={(e) => setPrice(e.target.value.replace(/[^\d۰-۹]/g, ""))}
                className="h-12 flex-1 rounded-xl border border-slate-200 bg-surface px-3 text-right" />
              <Button size="lg" disabled={!price || send.isPending}
                onClick={() => send.mutate({ status: "price_changed", price: Number(price.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) })}>
                ثبت
              </Button>
            </div>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="توضیح اختیاری (مثلاً: فقط رنگ مشکی داریم)"
            className="h-11 w-full rounded-xl border border-slate-200 bg-surface px-3 text-sm" />
        </>
      )}
      {send.isError && <div className="text-sm text-rose-600">{send.error.message}</div>}
      <p className="pt-2 text-[11px] leading-5 text-slate-400">این پیام از طرف یک خریدار واقعی از طریق بازارگرد ارسال شده است. شماره شما به خریدار داده نمی‌شود.</p>
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function Keypad({ token, inq }: { token: string; inq: SellerInquiry }) {
  const [state, setState] = useState(inq);
  const [digits, setDigits] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [noVoice, setNoVoice] = useState(false);
  const press = useMutation({
    mutationFn: (d: string) => api.keypress(token, d),
    onSuccess: async () => {
      stopSpeaking();
      setState(await api.sellerInquiry(token));
    },
  });

  const play = () => {
    if (!state.script) return;
    const ok = speak(state.script, () => setSpeaking(false));
    setSpeaking(ok);
    setNoVoice(!ok);
  };
  useEffect(() => () => stopSpeaking(), []);

  const tap = (k: string) => {
    if (press.isPending || state.status === "answered") return;
    if (k === "#") {
      if (digits.startsWith("3") && digits.length > 1) press.mutate(digits);
      return;
    }
    const next = (digits + k).replace(/[^0-9]/g, "");
    setDigits(next);
    if (next === "1" || next === "2") press.mutate(next);
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-inverse text-white shadow-xl">
      <div className="px-5 pt-6 pb-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"><PhoneIncoming size={26} /></div>
        <div className="mt-2 text-lg font-bold">تماس خودکار بازارگرد</div>
        <div className="text-xs text-white/55">{state.shop_name} · استعلام موجودی</div>
      </div>
      <div className="mx-4 rounded-2xl bg-white/5 p-3 text-[13px] leading-7 text-white/85">
        {state.script}
        <button onClick={speaking ? () => { stopSpeaking(); setSpeaking(false); } : play}
          className="mt-2 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs">
          <Volume2 size={14} /> {speaking ? "توقف پخش" : "پخش صدای تماس"}
        </button>
        {noVoice && <div className="mt-1 text-[11px] text-amber-300">صدای فارسی روی این دستگاه نصب نیست؛ متن بالا همان چیزی است که پخش می‌شود.</div>}
      </div>

      {state.status === "answered" ? (
        <div className="m-4"><Done inq={state} /></div>
      ) : (
        <>
          <div className="mt-4 text-center">
            <div className="h-9 text-3xl tracking-[0.3em]" dir="ltr">{faNum(digits) || " "}</div>
            <div className="text-[11px] text-white/55">۱ = موجود · ۲ = ناموجود · ۳ + قیمت به هزار تومان + #</div>
          </div>
          <div className="grid grid-cols-3 gap-3 p-5" dir="ltr">
            {KEYS.map((k) => (
              <button key={k} onClick={() => tap(k)}
                className={clsx("flex h-16 items-center justify-center rounded-full text-2xl font-bold transition active:scale-95",
                  k === "1" ? "bg-emerald-600" : k === "2" ? "bg-rose-600" : k === "3" ? "bg-amber-500" : "bg-white/10")}>
                {faNum(k)}
              </button>
            ))}
          </div>
          <div className="flex justify-center pb-5">
            <button onClick={() => setDigits(digits.slice(0, -1))} className="flex items-center gap-1 text-xs text-white/60"><Delete size={14} /> پاک کردن</button>
          </div>
        </>
      )}
      {press.isError && <div className="px-5 pb-4 text-center text-sm text-rose-300">{press.error.message}</div>}
    </div>
  );
}
