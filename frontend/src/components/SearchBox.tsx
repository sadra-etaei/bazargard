import { ArrowLeft, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePrefs } from "../lib/store";

export function SearchBox({ initial = "", autoFocus, compact }: { initial?: string; autoFocus?: boolean; compact?: boolean }) {
  const [q, setQ] = useState(initial);
  const nav = useNavigate();
  const addRecent = usePrefs((s) => s.addRecent);
  useEffect(() => {
    setQ(initial);
  }, [initial]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    if (!t) return;
    addRecent(t);
    nav(`/search?q=${encodeURIComponent(t)}`);
  };
  return (
    <form onSubmit={submit} className="relative">
      <Search size={19} className="absolute top-1/2 right-3.5 -translate-y-1/2 text-slate-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} enterKeyHint="search"
        placeholder="چی می‌خوای بخری؟ مثلاً «هندزفری بلوتوث زیر ۲ میلیون»"
        className={`${compact ? "h-10 rounded-xl bg-slate-50 text-sm shadow-none" : "h-13 rounded-2xl bg-surface text-[15px] shadow-sm"} w-full border border-slate-200 pr-11 pl-12 outline-none placeholder:text-[13px] placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100`} />
      <button type="submit" aria-label="جست‌وجو" className={`absolute top-1/2 left-1.5 flex ${compact ? "size-7 rounded-lg" : "size-10 rounded-xl"} -translate-y-1/2 items-center justify-center bg-torob text-white`}>
        {q.trim() ? <ArrowLeft size={19} /> : <Sparkles size={18} />}
      </button>
    </form>
  );
}
