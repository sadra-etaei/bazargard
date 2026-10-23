import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ClipboardList, GitCompare, Home, Map as MapIcon, MessageCircle, Route as RouteIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { SearchBox } from "./components/SearchBox";
import { liveInquiries } from "./components/InquiryLive";
import { NoticeCard, Toasts } from "./components/ui";
import { api } from "./lib/api";
import type { Inquiry } from "./lib/types";
import { faNum } from "./lib/format";
import { usePrefs } from "./lib/store";
import { ThemeToggle } from "./components/ThemeToggle";
import { useApplyTheme } from "./lib/theme";
import Activity from "./pages/Activity";
import Chat from "./pages/Chat";
import SellerCompare from "./pages/SellerCompare";
import { sellerCompareUrl } from "./lib/sellerComparison";
import Compare from "./pages/Compare";
import Go from "./pages/Go";
import HomePage from "./pages/Home";
import Mall from "./pages/Mall";
import Product from "./pages/Product";
import Results from "./pages/Results";
import SellerReply from "./pages/SellerReply";
import ShopPage from "./pages/Shop";
import StoresMap from "./pages/StoresMap";
import Trip from "./pages/Trip";

function useNavItems() {
  const visits = useQuery({ queryKey: ["visits"], queryFn: api.visits });
  const planned = (visits.data || []).filter((v) => v.state === "planned").length;
  return [
    { to: "/", label: "جست‌وجو", icon: Home, end: true, badge: 0 },
    { to: "/map", label: "نقشه", icon: MapIcon, end: false, badge: 0 },
    { to: "/chat", label: "دستیار", icon: MessageCircle, end: false, badge: 0 },
    { to: "/trip", label: "مسیر خرید", icon: RouteIcon, end: false, badge: planned },
    { to: "/activity", label: "پیگیری", icon: ClipboardList, end: false, badge: 0 },
  ];
}

export default function App() {
  const { pathname } = useLocation();
  useApplyTheme();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  // The chat has its own composer at the bottom, so phones get no tab bar there.
  const isChat = pathname.startsWith("/chat");
  // The guided "I'm going now" flow is full-screen too (its own step bar and buttons at the bottom).
  const immersive = isChat || pathname.startsWith("/go");
  // The seller's reply page is a standalone page: no shopper navigation.
  if (pathname.startsWith("/r/")) {
    return (
      <Routes>
        <Route path="/r/:token" element={<SellerReply />} />
      </Routes>
    );
  }
  return (
    <div className="min-h-dvh bg-paper">
      <TopNav />
      <main className={clsx("w-full", !isChat && "lg:px-8 2xl:px-14", !immersive && "pb-24 lg:pb-12")}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<Results />} />
          <Route path="/p/:id" element={<Product />} />
          <Route path="/p/:id/compare-sellers" element={<SellerCompare />} />
          <Route path="/s/:id" element={<ShopPage />} />
          <Route path="/mall/:key" element={<Mall />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/map" element={<StoresMap />} />
          <Route path="/trip" element={<Trip />} />
          <Route path="/go" element={<Go />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <InquiryWatcher />
      <CompareTray raised={!immersive} />
      {!immersive && <BottomNav />}
      <Toasts />
    </div>
  );
}

/** Desktop only: brand, search, where/when and the main sections in one bar. */
function TopNav() {
  const items = useNavItems();
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-[1600] hidden h-16 border-b border-slate-200 bg-surface/95 backdrop-blur lg:block">
      <div className="flex h-full w-full items-center gap-5 px-8 2xl:px-14">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img src="/icon.svg" alt="" className="size-9" />
          <div>
            <div className="text-[17px] leading-5 font-extrabold text-slate-900">بازارگرد</div>
            <div className="text-[10.5px] text-slate-500">دستیار خرید حضوری تهران</div>
          </div>
        </Link>
        <div className="min-w-[12rem] max-w-xl flex-1">{pathname !== "/" && <SearchBox compact />}</div>
        <ThemeToggle className="ms-auto" />
        <nav className="flex shrink-0 items-center gap-1">
          {items.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => clsx("relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm",
                isActive ? "bg-torob-50 font-bold text-torob" : "text-slate-600 hover:bg-slate-100")}>
              <Icon size={17} />
              {label}
              {!!badge && <span className="min-w-4 rounded-full bg-amber-400 px-1 text-center text-[10px] font-bold text-slate-900">{faNum(badge)}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

function BottomNav() {
  const items = useNavItems();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1500] border-t border-slate-200/70 bg-surface/90 pb-safe shadow-[0_-8px_24px_-12px_rgb(15_23_42/0.18)] backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => clsx("relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] before:absolute before:top-0 before:h-[3px] before:w-9 before:rounded-b-full before:bg-torob before:transition-opacity", isActive ? "font-bold text-torob before:opacity-100" : "text-slate-500 before:opacity-0")}>
            <Icon size={21} />
            {label}
            {!!badge && <span className="absolute top-1.5 right-[calc(50%-20px)] min-w-4 rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900">{faNum(badge)}</span>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function CompareTray({ raised }: { raised: boolean }) {
  const { compare, sellerComparison, set } = usePrefs();
  const { pathname } = useLocation();
  if (pathname.includes("compare-sellers") || pathname === "/compare" || pathname.startsWith("/chat") || pathname.startsWith("/go")) return null;
  const showSellers = !!sellerComparison?.sellers.length && (pathname === `/p/${sellerComparison.productId}` || compare.length === 0);
  if (!compare.length && !showSellers) return null;
  if (showSellers && sellerComparison) return <div className={clsx("fixed inset-x-0 z-[1400] mx-auto max-w-lg px-3 lg:bottom-6", raised ? "bottom-[68px]" : "bottom-20")}><div className="flex items-center gap-2 rounded-2xl bg-inverse p-3 text-white shadow-xl"><GitCompare size={18} className="text-amber-300" /><div className="min-w-0 flex-1 text-xs"><b>{faNum(sellerComparison.sellers.length)} فروشنده</b><div className="truncate text-[10px] text-white/60">{sellerComparison.title}</div></div><button onClick={() => set({ sellerComparison: null })} className="px-2 text-xs">پاک کردن</button>{sellerComparison.sellers.length >= 2 ? <Link to={sellerCompareUrl(sellerComparison)} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950">مقایسه فروشنده‌ها</Link> : <span className="text-[11px] text-amber-200">یک فروشنده دیگر انتخاب کنید</span>}</div></div>;
  return (
    <div className={clsx("fixed inset-x-0 z-[1400] mx-auto max-w-lg px-3 lg:bottom-6 lg:max-w-md", raised ? "bottom-[68px]" : "bottom-20")}>
      <div className="flex items-center gap-2 rounded-2xl bg-inverse p-2 pr-3 text-white shadow-xl">
        <GitCompare size={18} className="shrink-0 text-amber-300" />
        <div className="flex -space-x-2 space-x-reverse">
          {compare.map((p) => <img key={p.product_id} src={p.image || ""} alt="" className="size-8 rounded-lg bg-surface object-contain ring-2 ring-slate-900" />)}
        </div>
        <div className="flex-1 text-xs">{faNum(compare.length)} کالا برای مقایسه</div>
        <button onClick={() => set({ compare: [] })} className="px-2 text-xs text-white/60">حذف</button>
        <Link to={compare.length > 1 ? "/compare" : "#"} aria-disabled={compare.length < 2} onClick={e => { if (compare.length < 2) e.preventDefault(); }} className={clsx("rounded-xl px-3 py-2 text-xs font-bold", compare.length > 1 ? "bg-amber-400 text-amber-950" : "bg-white/15 text-white/70")}>
          مقایسه
        </Link>
      </div>
    </div>
  );
}

/** Pops up seller answers that arrive while the shopper is elsewhere in the app. */
function InquiryWatcher() {
  const nav = useNavigate();
  const [shown, setShown] = useState<Inquiry | null>(null);
  const dismissed = useRef(new Set<number>());
  const q = useQuery({ queryKey: ["unseen-inquiries"], queryFn: () => api.inquiries(true), refetchInterval: 5000 });
  useEffect(() => {
    if (shown) return;
    const next = (q.data || []).find((i) => !liveInquiries.has(i.id) && !dismissed.current.has(i.id));
    if (next) setShown(next);
  }, [q.data, shown]);
  if (!shown) return null;
  const dismiss = () => {
    dismissed.current.add(shown.id);
    api.inquirySeen(shown.id);
    setShown(null);
  };
  const good = shown.answer !== "out_of_stock";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[2500] flex justify-center px-3 lg:top-20">
      <NoticeCard
        n={{
          tone: good ? "success" : "warn",
          title: `${shown.shop_name} پاسخ داد`,
          text: `${shown.summary}${shown.product_title ? ` — ${shown.product_title}` : ""}`,
          duration: 0,
          action: shown.product_id ? { label: good ? "مشاهده" : "دیدن جایگزین‌ها", onClick: () => nav(`/p/${shown.product_id}`) } : undefined,
        }}
        onClose={dismiss}
      />
    </div>
  );
}
