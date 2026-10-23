import { ShoppingRequirements } from "../components/ShoppingRequirements";
import { AfterHoursPanel } from "../components/AfterHours";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, Bot, RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ContextBar } from "../components/ContextBar";
import { ThemeToggle } from "../components/ThemeToggle";
import { MapView, pricePin } from "../components/MapView";
import { OpenBadge } from "../components/ui";
import { conversationFilters } from "../lib/shoppingContext";
import { api, qs } from "../lib/api";
import { km, toman } from "../lib/format";
import { useCtx } from "../lib/hooks";
import { type ChatMessage, usePrefs } from "../lib/store";
import type { AssistantReply, Filters } from "../lib/types";

const STARTERS = [
  "یه هدیه برای مادرم می‌خوام، کمکم می‌کنی؟",
  "ساعت ۱۱ شب شارژر موبایل لازم دارم",
  "فرق پاوربانک ۱۰ هزار و ۲۰ هزار چیه؟",
  "برای عکاسی با گوشی چی بخرم؟",
  "هندزفری بلوتوث زیر ۲ میلیون نزدیک جمهوری",
  "اول بگو بازار الکترونیک تهران چطوریه",
];

export default function Chat() {
  const nav = useNavigate();
  const ctx = useCtx();
  const prefs = usePrefs();
  const { chat, chatState } = prefs;
  const [text, setText] = useState("");
  const meta = useQuery({ queryKey: ["meta"], queryFn: api.meta, staleTime: Infinity });
  const endRef = useRef<HTMLDivElement>(null);
  // ids of replies that just arrived in this session: only those get the typing effect, not the restored history
  const fresh = useRef(new Set<string>());

  const send = useMutation({
    mutationFn: ({ message, state }: { message: string; state: Record<string, unknown> }) => api.assistant(message, state),
    onSuccess: (reply) => {
      const s = usePrefs.getState();
      const newId = crypto.randomUUID?.() ?? String(Date.now());
      fresh.current.add(newId);
      const f = reply.filters;
      const patch: Partial<typeof s> = {
        chat: [...s.chat, { id: newId, role: "assistant", text: reply.reply, reply }],
        chatState: reply.state,
      };
      s.set(patch);
      s.applyShoppingFilters(f);
      if (reply.action === "open_visits") setTimeout(() => nav("/trip"), 900);
    },
    onError: () => {
      const s = usePrefs.getState();
      s.set({ chat: [...s.chat, { id: String(Date.now()), role: "assistant", text: "ارتباط با سرور برقرار نشد. دوباره امتحان کنید." }] });
    },
  });

  const ask = (message: string, display = message, extra: Filters = {}) => {
    if (!message.trim() || send.isPending) return;
    const prev = (chatState.filters as Filters) || {};
    // Current shared requirements override stale conversation metadata, including explicit removals.
    const filters = conversationFilters(prev, ctx, extra);
    const msg: ChatMessage = { id: String(Date.now()), role: "user", text: display };
    prefs.set({ chat: [...chat, msg] });
    send.mutate({ message, state: { ...chatState, filters } });
    setText("");
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length, send.isPending]);
  const last = [...chat].reverse().find((m) => m.role === "assistant")?.reply;
  const lastProducts = last?.search?.products || [];
  const pins = lastProducts.map((p) => ({ id: p.product_id, lat: p.best.shop.lat, lon: p.best.shop.lon, label: pricePin(p.best.price),
    closed: p.best.shop.status.state === "closed" }));

  return (
    <div className="flex min-h-dvh flex-col lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:max-w-none lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="sticky top-0 z-[1000] border-b border-slate-200 bg-surface/95 px-3 pt-2.5 pb-2 backdrop-blur lg:static lg:px-8 lg:pt-4">
        <div className="flex items-center gap-2">
          <button onClick={() => nav(-1)} className="rounded-full p-1.5 hover:bg-slate-100 lg:hidden" aria-label="بازگشت"><ArrowRight size={20} /></button>
          <div className="flex size-8 items-center justify-center rounded-full bg-brand-700 text-white"><Bot size={18} /></div>
          <div className="flex-1">
            <div className="text-sm font-bold">دستیار بازارگرد</div>
            <div className="text-[11px] text-slate-500">{meta.data?.llm || last?.llm ? "هوش مصنوعی + داده‌های ترب" : "جست‌وجوی هوشمند در داده‌های ترب"}</div>
          </div>
          <ThemeToggle className="size-8" />
          {chat.length > 0 && (
            <button onClick={() => prefs.set({ chat: [], chatState: {} })} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
              <RotateCcw size={13} /> گفت‌وگوی جدید
            </button>
          )}
        </div>
        {meta.data && !meta.data.llm && meta.data.llm_hint && (
          <div className="mt-2 rounded-xl bg-amber-50 px-3 py-1.5 text-[11px] leading-5 text-amber-900">هوش مصنوعی فعال نیست: {meta.data.llm_hint}</div>
        )}
        <div className="mt-2"><ContextBar compact /></div>
        <ShoppingRequirements />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 lg:px-8"><div className="mx-auto max-w-3xl space-y-3">
        {chat.length === 0 && (
          <div className="animate-fadein">
            <Bubble role="assistant">
              سلام! من بازارگردم 👋 یه دوست باتجربه توی بازار تهران. می‌تونی فقط باهام حرف بزنی: بگو چی لازم داری یا چی تو ذهنته، اگه مطمئن نیستی
              کمکت می‌کنم انتخاب کنی، و وقتی آماده بودی مغازه‌هایی که موقع رسیدنت بازن رو پیدا می‌کنم.
            </Bubble>
            <div className="mt-3 flex flex-col items-start gap-2 md:grid md:grid-cols-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="flex items-center gap-1.5 rounded-2xl bg-surface px-3 py-2 text-[13px] text-slate-700 ring-1 ring-brand-200">
                  <Sparkles size={13} className="text-brand-600" /> {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={m.id} className="animate-fadein">
            <Bubble role={m.role}>{m.role === "assistant" ? <Rich text={m.text} animate={i === chat.length - 1 && fresh.current.has(m.id)} onDone={() => fresh.current.delete(m.id)} /> : m.text}</Bubble>
            {m.reply && <ReplyExtras reply={m.reply} latest={i === chat.length - 1} onAsk={ask} />}
          </div>
        ))}
        {send.isPending && (
          <Bubble role="assistant">
            <span className="inline-flex gap-1">
              {[0, 1, 2].map((d) => <span key={d} className="size-2 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${d * 120}ms` }} />)}
            </span>
          </Bubble>
        )}
        <div ref={endRef} />
      </div></div>

      <form onSubmit={(e) => { e.preventDefault(); ask(text); }}
        className="sticky bottom-0 mx-auto flex w-full max-w-3xl items-center gap-2 border-t border-slate-200 bg-surface px-3 py-2.5 pb-safe lg:static lg:mb-4 lg:rounded-2xl lg:border lg:shadow-float">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="هر چی می‌خوای بپرس یا کالا رو جست‌وجو کن…" enterKeyHint="send"
          className="h-11 flex-1 rounded-2xl bg-slate-100 px-4 text-sm outline-none focus:ring-2 focus:ring-brand-200" />
        <button type="submit" disabled={!text.trim() || send.isPending} aria-label="ارسال"
          className="flex size-11 items-center justify-center rounded-2xl bg-brand-700 text-white disabled:opacity-40">
          <Send size={18} className="-scale-x-100" />
        </button>
      </form>
      </div>

      {pins.length > 0 && (
        <aside className="hidden w-[30rem] shrink-0 border-r border-slate-200 bg-surface p-4 xl:w-[36rem] lg:block">
          <div className="mb-2 text-sm font-bold text-slate-700">نتایج آخرین پیشنهاد روی نقشه</div>
          <MapView className="h-[calc(100dvh-9rem)]" pins={pins} />
        </aside>
      )}
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={clsx("flex", role === "user" ? "justify-start" : "justify-end")}>
      <div className={clsx("max-w-[85%] rounded-3xl px-4 py-2.5 text-[14px] leading-7",
        role === "user" ? "rounded-tr-md bg-brand-700 text-white" : "rounded-tl-md bg-surface text-slate-800 ring-1 ring-slate-900/[0.06] shadow-card")}>
        {children}
      </div>
    </div>
  );
}

function ReplyExtras({ reply, latest, onAsk }: { reply: AssistantReply; latest: boolean; onAsk: (m: string, d?: string, extra?: Filters) => void }) {
  const products = reply.search?.products || [];
  const alt = reply.alternatives;
  const f = reply.filters;
  const resultsUrl = `/search${qs({ q: f.q, category: f.category, brand: f.brand, budget_min: f.budget_min, budget_max: f.budget_max })}`;
  return (
    <div className="mt-2 space-y-2">
      {reply.search && reply.chips.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {reply.chips.map((c) => <span key={c.key + c.label} className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] text-brand-800 ring-1 ring-brand-200">{c.label}</span>)}
        </div>
      )}
      {latest && reply.clarify.length > 0 && (
        <div className="rounded-2xl bg-surface p-3 ring-1 ring-slate-900/[0.06] shadow-card">
          <div className="text-xs font-bold text-slate-600">منظورت کدومه؟</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reply.clarify.map((c) => (
              <button key={c} onClick={() => onAsk("همین", c, { category: c })} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs">{c}</button>
            ))}
          </div>
        </div>
      )}
      {latest && reply.search?.after_hours && <AfterHoursPanel data={reply.search.after_hours} />}
      {products.length > 0 && (
        <>
          <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1 no-scrollbar">
            {products.map((p) => (
              <Link key={p.product_id} to={`/p/${p.product_id}`} className="w-52 shrink-0 rounded-2xl bg-surface p-2.5 ring-1 ring-slate-900/[0.06] shadow-card transition hover:ring-brand-500">
                <img src={p.image || ""} alt="" loading="lazy" className="h-24 w-full rounded-xl bg-slate-50 object-contain" />
                <div className="mt-2 line-clamp-2 text-[12.5px] font-bold leading-5">{p.title}</div>
                <div className="mt-1 text-sm font-extrabold text-slate-900">{toman(p.best.price)}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{p.best.shop.name}{p.best.shop.distance_km !== null && ` · ${km(p.best.shop.distance_km)}`}</div>
                <div className="mt-1.5"><OpenBadge state={p.best.shop.status.state} label={p.best.shop.status.state === "unknown" ? "ساعت نامشخص" : p.best.shop.status.label.slice(0, 20)} /></div>
                <div className="mt-1.5 text-[10.5px] text-slate-500">{p.why}</div>
              </Link>
            ))}
          </div>
          <Link to={resultsUrl} className="block text-center text-xs font-medium text-brand-700">همه {reply.search!.total > products.length ? "نتایج" : ""} با فیلتر و نقشه ←</Link>
        </>
      )}
      {alt && (
        <div className="space-y-1.5">
          {[...alt.same_mall, ...alt.same_product.filter((o) => !alt.same_mall.includes(o))].slice(0, 4).map((o) => (
            <Link key={o.offer_id} to={`/p/${alt.product.product_id}`} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-xs ring-1 ring-slate-900/[0.06] shadow-card">
              <span className="truncate">{o.shop.name} {o.shop.mall && <span className="text-slate-400">· {o.shop.mall}</span>}</span>
              <span className="shrink-0 font-bold">{toman(o.price)}</span>
            </Link>
          ))}
          {alt.similar.slice(0, 3).map((p) => (
            <Link key={p.product_id} to={`/p/${p.product_id}`} className="flex items-center gap-2 rounded-xl bg-surface p-2 text-xs ring-1 ring-slate-900/[0.06] shadow-card">
              <img src={p.image || ""} alt="" className="size-10 rounded-lg bg-slate-50 object-contain" />
              <span className="line-clamp-1 flex-1">{p.title}</span>
              <span className="shrink-0 text-brand-700">{p.why.split(" · ")[1] || ""}</span>
            </Link>
          ))}
        </div>
      )}
      {latest && reply.suggestions.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5 pt-1">
          {reply.suggestions.map((s) => (
            <button key={s} onClick={() => onAsk(s)} className="rounded-full border border-brand-300 bg-surface px-3 py-1.5 text-xs text-brand-800">{s}</button>
          ))}
          {reply.state.product_id ? (
            <button onClick={() => onAsk("موجود نبود، جایگزین چی داری؟", "نداشتن؛ جایگزین؟")} className="rounded-full border border-rose-200 bg-surface px-3 py-1.5 text-xs text-rose-700">نداشتن؛ جایگزین؟</button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Minimal markdown for model replies: **bold**, `-`/`•` bullets and numbered lines; everything else stays plain text. */
function Rich({ text, animate, onDone }: { text: string; animate?: boolean; onDone?: () => void }) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) return;
    // ~6 chars per frame-ish: a long reply still lands in about a second and a half
    const step = Math.max(2, Math.ceil(text.length / 90));
    const t = setInterval(() => setShown((n) => {
      if (n + step >= text.length) { clearInterval(t); onDone?.(); return text.length; }
      return n + step;
    }), 16);
    return () => clearInterval(t);
  }, [animate, text]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleText = text.slice(0, shown);
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <b key={i} className="font-bold">{part.slice(2, -2)}</b> : part);
  // markdown tables (model comparisons): consecutive lines that start with "|"
  const blocks: ({ kind: "line"; raw: string } | { kind: "table"; rows: string[][] })[] = [];
  for (const raw of visibleText.split("\n")) {
    if (/^\s*\|/.test(raw)) {
      const cells = raw.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const last = blocks[blocks.length - 1];
      if (last?.kind === "table") last.rows.push(cells);
      else blocks.push({ kind: "table", rows: [cells] });
    } else blocks.push({ kind: "line", raw });
  }
  return (
    <>
      {blocks.map((blk, i) => {
        if (blk.kind === "table") {
          const rows = blk.rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
          return (
            <div key={i} className="my-2 overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="w-full min-w-[20rem] border-collapse text-[12.5px] leading-6">
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri} className={clsx(ri === 0 ? "bg-slate-50 font-bold" : "border-t border-slate-100")}>
                      {r.map((c, ci) => <td key={ci} className={clsx("px-2.5 py-1.5 align-top", ci === 0 && "font-medium text-slate-600")}>{bold(c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const line = blk.raw.replace(/^#{1,4}\s*/, "");
        const li = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(line);
        if (li) {
          return <div key={i} className="flex gap-2"><span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-brand-500" /><span>{bold(li[1])}</span></div>;
        }
        return line.trim() ? <div key={i}>{bold(line)}</div> : <div key={i} className="h-2" />;
      })}
    </>
  );
}
