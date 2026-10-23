import { usePrefs } from "../lib/store";
import { faNum } from "../lib/format";

export function UnknownConditions({ count }: { count?: number }) {
  const { includeUnknown, conditions, set } = usePrefs();
  if (!Object.values(conditions).some(Boolean)) return null;
  return <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">
    <label className="flex cursor-pointer items-start gap-2">
      <input type="checkbox" checked={includeUnknown} onChange={(e) => set({ includeUnknown: e.target.checked })} className="mt-1 size-4 shrink-0 accent-amber-700" />
      <span>نمایش گزینه‌های نیازمند استعلام{!includeUnknown && count !== undefined ? ` (${faNum(count)} کالای دیگر)` : ""}</span>
    </label>
    <p className="mt-1 text-[11px]">اطلاعات نامشخص به معنی نداشتن آن امکان نیست. موارد مخالف شرایط شما همچنان حذف می‌شوند.</p>
  </div>;
}
