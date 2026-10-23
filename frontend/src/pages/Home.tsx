import { useQuery } from "@tanstack/react-query";
import { Building2, Clock, MessageCircle, Route as RouteIcon, Search, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { ContextBar } from "../components/ContextBar";
import { SearchBox } from "../components/SearchBox";
import { Section, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { faNum, km } from "../lib/format";
import { usePrefs } from "../lib/store";

const EXAMPLES = [
  "هندزفری بلوتوث زیر ۲ میلیون نزدیک جمهوری که الان باز باشه",
  "دوربین مداربسته وای فای فردا عصر",
  "ال سی دی آیفون 11 با گارانتی",
  "پاوربانک شیائومی قسطی",
];

const STEPS = [
  { icon: Search, title: "بگو چی می‌خوای", text: "با زبان خودت؛ بودجه، محله و زمان رو خودش می‌فهمه" },
  { icon: ShieldCheck, title: "شفاف مقایسه کن", text: "قیمت ثبت‌شده، تازگی قیمت، گارانتی و ساعت کاری کنار هم" },
  { icon: MessageCircle, title: "قبل از رفتن بپرس", text: "پیام استعلام آماده؛ جواب فروشنده رو ثبت کن" },
  { icon: RouteIcon, title: "یه مسیر، چند مغازه", text: "ترتیب مراجعه، پاساژ و طبقه، و جایگزین اگه نداشت" },
];

export default function HomePage() {
  const meta = useQuery({ queryKey: ["meta"], queryFn: api.meta, staleTime: Infinity });
  const { recent, location } = usePrefs();
  const malls = (meta.data?.malls || []).map((m) => ({
    ...m, dist: location ? Math.hypot((m.lat - location.lat) * 111, (m.lon - location.lon) * 90) : null,
  }));
  return (
    <div>
      <header className="hero-wash lg:flex lg:items-center lg:justify-between lg:gap-12 px-4 pt-5 pb-14 text-slate-900 md:rounded-b-3xl lg:mt-6 lg:rounded-3xl lg:px-12 lg:pt-12 lg:pb-24">
        <div className="flex items-center justify-between lg:hidden">
          <div>
            <div className="flex items-center gap-2 text-xl font-extrabold"><img src="/icon.svg" alt="" className="size-8" />بازارگرد</div>
            <div className="mt-0.5 text-xs text-slate-500">دستیار خرید حضوری از مغازه‌ها و پاساژهای تهران</div>
          </div>
          <Link to="/chat" className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700">
            <MessageCircle size={15} /> دستیار
          </Link>
        </div>
        <div className="hidden max-w-2xl lg:block">
          <h1 className="text-4xl leading-[1.4] font-extrabold">قبل از اینکه بری خرید <br /><span className="bg-gradient-to-l from-brand-600 to-torob bg-clip-text text-transparent">بدون کجا بری.</span></h1>
          <p className="mt-3 text-base leading-8 text-slate-500">
            کالا رو در مغازه‌هاو پاساژهای تهران پیدا کن، قیمت‌ها رو شفاف مقایسه کن، ببین موقع رسیدنت بازن یا نه،
            و با یک مسیر چند خرید رو یکجا انجام بده.
          </p>
        </div>
        {meta.data && (
          <div className="hidden w-[22rem] shrink-0 gap-3 lg:grid xl:w-[28rem]">
            {[
              { n: meta.data.stats.listing_shops, label: "فروشگاه با کالای ثبت‌شده", icon: Building2 },
              { n: meta.data.stats.products, label: "کالا در پایگاه داده", icon: Search },
              { n: meta.data.stats.offers, label: "قیمت ثبت‌شده در ترب", icon: ShieldCheck },
            ].map((x) => (
              <div key={x.label} className="flex items-center gap-4 rounded-2xl bg-surface/80 px-5 py-4 shadow-card ring-1 ring-slate-900/[0.05] backdrop-blur">
                <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700"><x.icon size={22} /></span>
                <div>
                  <div className="text-2xl font-extrabold tracking-tight">{faNum(x.n.toLocaleString("en-US"))}</div>
                  <div className="text-xs text-slate-500">{x.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="-mt-8 px-4 lg:-mt-14 lg:px-12">
        <div className="lg:max-w-2xl">
          <SearchBox />
          <div className="mt-3"><ContextBar /></div>
          <Link to="/map" className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-bold text-brand-800 ring-1 ring-slate-200"><Building2 size={16} /> انتخاب فروشگاه روی نقشه</Link>
        </div>

        {recent.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar lg:flex-wrap">
            {recent.map((r) => (
              <Link key={r} to={`/search?q=${encodeURIComponent(r)}`} className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-900/[0.06] shadow-card">
                <Clock size={12} /> {r}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:px-0">
        <div>
          <Section title="مثلاً این‌طوری بپرس">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1">
              {EXAMPLES.map((e) => (
                <Link key={e} to={`/search?q=${encodeURIComponent(e)}`} className="block rounded-xl bg-surface px-3.5 py-2.5 text-[13px] text-slate-700 ring-1 ring-slate-900/[0.06] shadow-card transition hover:ring-brand-500 lg:py-3 lg:text-sm">
                  «{e}»
                </Link>
              ))}
            </div>
          </Section>

          <Section title="دسته‌های پرطرفدار">
            <div className="flex flex-wrap gap-2">
              {meta.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
              {(meta.data?.categories || []).slice(0, 18).map((c) => (
                <Link key={c.name} to={`/search?category=${encodeURIComponent(c.name)}`}
                  className="rounded-full bg-surface px-3 py-1.5 text-xs text-slate-700 ring-1 ring-slate-900/[0.06] shadow-card transition hover:ring-brand-500">{c.name}</Link>
              ))}
            </div>
          </Section>
        </div>

        <div>
          <Section title="پاساژهای پرفروشنده">
            <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-2">
              {malls.slice(0, 6).map((m) => (
                <Link key={m.key} to={`/mall/${encodeURIComponent(m.key)}`} className="card-hover w-36 shrink-0 rounded-2xl bg-surface p-3 ring-1 ring-slate-900/[0.06] shadow-card transition hover:ring-brand-500 md:w-auto">
                  <Building2 size={20} className="text-brand-700" />
                  <div className="mt-2 line-clamp-1 text-sm font-bold">{m.name}</div>
                  <div className="text-[11px] text-slate-500">{faNum(m.shops)} فروشنده با کالای ثبت‌شده</div>
                  {m.dist !== null && <div className="mt-1 text-[11px] text-brand-700">{km(m.dist)}</div>}
                </Link>
              ))}
            </div>
          </Section>

          <Section title="بازارگرد چطور کمک می‌کند؟">
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-2">
              {STEPS.map((s, i) => (
                <div key={s.title} className="rounded-2xl bg-surface p-3 ring-1 ring-slate-900/[0.06] shadow-card">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700"><s.icon size={16} /></span>
                    <span className="text-[11px] font-bold text-slate-400">گام {faNum(i + 1)}</span>
                  </div>
                  <div className="mt-2 text-sm font-bold">{s.title}</div>
                  <div className="mt-0.5 text-[11.5px] leading-5 text-slate-500">{s.text}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {meta.data && (
        <p className="mx-4 mt-6 mb-2 rounded-2xl bg-slate-100 p-3 text-[11px] leading-6 text-slate-500 lg:mx-0 lg:text-xs">
          داده‌ها: {faNum(meta.data.stats.listing_shops)} فروشگاه با کالای ثبت‌شده از {faNum(meta.data.stats.shops)} فروشگاه،
          {" "}{faNum(meta.data.stats.products)} کالا و {faNum(meta.data.stats.offers)} قیمت ثبت‌شده در ترب. «قیمت ثبت‌شده» قیمت قطعی امروز نیست و
          موجودی فقط وقتی «تأییدشده» است که خودتان یا خریدار دیگری با فروشنده چک کرده باشد. نام و شماره بیشتر فروشگاه‌ها در این نسخه نمایشی است.
        </p>
      )}
    </div>
  );
}
