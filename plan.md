# Plan — Smart In-Person Shopping Assistant for Tehran (Torob dataset)

Goal: a Persian, RTL, mobile-first assistant that helps someone **go and buy something in person** in Tehran: understand what they need, find shops that actually list it, compare options honestly, plan the visit, and handle "they didn't have it" with alternatives.

Implemented stack: **Django + django-ninja + SQLite (FTS5), React (Vite) frontend, optional OpenAI-compatible LLM endpoint.** Docker deployment and a PWA service worker remain future work.

> Note: the challenge says the assistant's four steps are explained in a video we haven't seen. This plan assumes they are roughly **(1) understand need → (2) search & compare → (3) choose shop & plan the visit → (4) follow-up / alternatives**. Re-check against the video before building and adjust section 3.

---

## 1. Scoring map (what we optimise for)

| Criterion | Pts | What earns it in our build |
|---|---|---|
| Product | 75 | All four steps end-to-end, real pain points solved (open hours, mall floor/unit, price freshness, "is it in stock?", alternatives) |
| UX | 75 | Cards/filters/buttons, not chat-only; easy change of area/budget/conditions; clear "why recommended" + next step; Persian RTL on mobile |
| Intelligence | 50 | Seller follow-up, alternative finding, visit-condition awareness (time, location, user need) |
| Deploy | 40 | Live public URL, Docker Compose, health check, stable demo data |
| Technical | 40 | Clean structure, fast search, typed API, tests on core logic |
| Dataset | 20 | Correct use of shops/products/offers + transparent display of unknowns |

Product + UX = 150/300 → UX polish and the demo video matter more than backend scale.

---

## 2. Dataset work

### 2.0 What the dataset actually contains (profiled 2026-10-22)

Files: `dataset/shops.csv`, `products.csv`, `offers.csv` (UTF-8 CSV, nested fields are JSON strings, missing = literal `null`).

| File | Rows | Columns | Notable gaps |
|---|---|---|---|
| shops | 6,476 | address, category_names, contacts, instagram, lat, lon, location_label, name, payment_options, shop_id, supports_fast_delivery, website_url, weekly_hours | hours missing 30%, categories missing 27%, payment options missing 95%, fast-delivery unknown 75% |
| products | 225,903 | brand_name, category_name (3,428 categories), image_urls, model, persian_title, product_id, specs (key/section/value) | brand missing 74%, specs missing 35%, model missing 98% |
| offers | 331,506 | description, last_price_changed_at, offer_id, price_toman, product_id, seller_title, shop_id, warranty (provider, period_months, description) | price missing 4.5%, warranty missing 82% |

Findings that change the design:
- **Prices are in Toman.** There are junk outliers (min 1 Toman, max ~7×10¹⁷) → sanity-filter or mark "قیمت نامعتبر" (e.g. drop < 1,000 or > per-category p99.9 × 10).
- **Price dates go from 2020-12 to 2026-10-13.** About 65% changed in Sep–Oct 2026, but there's a long tail of stale prices → the price-age badge is essential, and ranking should down-weight stale prices.
- **2,684 of 6,476 shops (41%) have no offers** → they are "category-only" shops. Never show them as having a product; use them only as "may sell this kind of item".
- **Geography is very concentrated**: فردوسی 3,282, شیخ هادی 1,587, بهارستان 616 (the Jomhouri / Alaeddin / Charsou electronics area), then a long tail. `location_label` = neighbourhood name. Malls / floor / unit are only inside the free-text `address` (e.g. "پاساژ علاالدین 2، طبقه 6، واحد 622") → parse with regex.
- **Catalogue skews to electronics & electrical**: building cable, CCTV, watches, panel lights, phone cases, connectors, generators, pumps, relays, breakers, inverters, phone LCDs, headphones. **Demo scenarios should use these** (CCTV camera, handsfree, phone LCD, breaker) — not clothes or groceries.
- **Hours**: per weekday `status` ∈ declared / closed / unsupported, with `shifts` (start/end). Missing for 30% → "ساعت کاری نامشخص".
- **Contacts**: only `phone` (all fake). No WhatsApp/Bale in this export → seller follow-up works as **call + copy/share a ready message**, not a direct messenger integration.
- **Payment options**: 4% of shops; providers ترب‌پی, اسنپ‌پی, دیجی‌پی, تارا, ازکی‌وام; `channel` is `in_person` or `unknown` → show "حضوری تأیید شده" vs "نوع پرداخت نامشخص" separately.
- **Warranty** is structured (provider like شرکتی / تست و تحویل در حضور مشتری / بدون گارانتی, months, description) → good for compare tables.
- **Not in this export** (although the challenge text mentions them): shop descriptions, shop images, Torob history, licences, kalabarg. Drop those features or show them as unavailable.
- Product images are available for ~99% of products (Torob CDN URLs) → product cards can always show an image.

### 2.1 Pipeline

1. **Profile** → write the above (plus per-column stats) to `docs/dataset.md`.
2. **Load into SQLite** (`scripts/build_db.py`, idempotent):
   - `shops` — id, name, name_is_real (has instagram/website → 112 real), category_names, address, location_label, lat/lng, mall / floor / unit (parsed from address), weekly_hours (normalised per weekday), phone, payment_options (provider + channel), fast_delivery (true/false/unknown).
   - `products` — id, persian_title, brand, model, category, specs, image_urls.
   - `offers` — offer_id, shop_id, product_id, seller_title, description, price_toman (+ `price_valid` flag), warranty fields, last_price_changed_at.
3. **Normalise Persian text**: ی/ي, ک/ك, Persian/Arabic digits → Latin, ZWNJ, strip diacritics. Same normaliser at index and query time.
4. **Search index**: SQLite FTS5 over product titles (fa+en), brand, category, seller titles. Optional later: embeddings for semantic match ("گوشی برای عکاسی").
5. **Derived fields**:
   - `price_age_days` from price_updated_at (data is ~1 week old → show it honestly).
   - `mall` grouping (shops sharing a mall name / near-identical coordinates) for "one trip, several shops".
   - `open_now(time)` from hours; `unknown` when hours missing.
6. **Key distinction to preserve everywhere**:
   - Shop **has an offer** for the product → "listed by this shop".
   - Shop only has a **matching activity category** → "may sell this kind of item — not confirmed". Never presented as stock.
   - Neither listed price nor listing = **confirmed inventory**. Inventory is only "confirmed" after a follow-up (see 3.4).

---

## 3. Product: the four steps

### 3.1 Understand the need
- Entry: one search box + quick chips (category, budget, area). Free text like "یه هندزفری بلوتوثی زیر ۲ میلیون نزدیک ونک که الان باز باشه".
- LLM parses into a structured query: product keywords, category, brand, budget min/max, location (named area → coordinates via a small Tehran neighbourhood table, or device GPS), radius, time constraint ("الان", "فردا عصر"), conditions (TorobPay, installments, kalabarg, warranty required).
- Parsed intent is shown as **editable filter chips** — user fixes them with taps, not by re-typing.
- If ambiguous (e.g. "گوشی سامسونگ"), show a small clarifying card with 2–4 options instead of guessing.

### 3.2 Search & compare
- **Product results**: grouped by BaseProduct; each card shows image, title, price range across shops, number of shops listing it, nearest shop distance.
- **Product detail**: specs + list of sellers sorted by a transparent score; each seller row shows price, price age ("قیمت ۶ روز پیش ثبت شده"), distance, open/closed/unknown, warranty, payment options.
- **Compare view**: pick 2–3 products or 2–3 sellers → side-by-side table; unknown fields shown as "نامشخص", not hidden.
- **"Why this?" line** on every recommended item (e.g. "ارزان‌ترین در ۳ کیلومتری · الان باز · گارانتی ۱۸ ماهه").
- Ranking = weighted: price, distance, open at visit time, price freshness, warranty, matching conditions. Weights exposed as a simple "اولویت: قیمت / نزدیکی / اطمینان" toggle.

### 3.3 Choose shop & plan the visit
- **Map view** (Leaflet + OSM tiles; Neshan/Balad link-outs) with shop pins coloured by listed / category-only.
- **Visit card** per shop: address, mall + floor + unit, hours today, open-at-arrival check, "Navigate" deep links (Neshan, Balad, Google Maps), call / WhatsApp / Bale buttons.
- **Trip plan**: user adds shops to a "visit list" → ordered route (nearest-neighbour over coordinates), warns if a shop will be closed on arrival, groups shops in the same mall ("۳ فروشنده در همین پاساژ").
- **Pre-visit checklist** auto-generated: what to ask (stock, exact model/colour, warranty provider, price confirmation, TorobPay/installments), what to bring (kalabarg, ID for installments).

### 3.4 Follow-up & alternatives (intelligence)
- **Seller follow-up**: "از فروشنده بپرس" generates a ready message (WhatsApp/Bale/SMS text) asking about stock and current price; user records the answer with buttons: موجود است / موجود نیست / قیمت تغییر کرده (+ new price). This is the only path that turns an offer into "confirmed by you, at <time>".
- **Out of stock → alternatives**, in order: same product at other nearby shops → same product in the same mall → similar products (same category + brand, close price, similar specs) at this or nearby shops → category-only shops nearby, clearly labelled unconfirmed.
- **Context awareness**: if it's late, prefer shops open longer; Fridays/holidays; if the user needs installments, filter to sellers that offer it; if distance is large, suggest a closer slightly-pricier option and say the trade-off.
- **Saved searches / watch list**: save a product + area; show if listed prices change when data refreshes (demo with dataset timestamps).
- **Purchase log**: after visit, user marks "bought at X for Y" → closes the flow.

---

## 4. UX principles

- Persian, `dir="rtl"`, Vazirmatn font, Persian digits in UI, Toman formatting (check the dataset's price unit — Rial vs Toman).
- Mobile-first (360–430px), bottom nav: جست‌وجو · نقشه · لیست مراجعه · پیگیری.
- Chat is a helper, not the only path: every assistant answer renders as **cards with action buttons** (compare, add to visit list, navigate, ask seller, show alternatives).
- Filters always visible as chips at the top; changing one re-runs instantly.
- **Transparency badges** (consistent icons + text):
  - قیمت ثبت‌شده · X روز پیش
  - در لیست فروشنده / فقط دسته فعالیت (تأییدنشده)
  - موجودی: تأییدنشده / تأیید شده توسط شما در <time>
  - ساعت کاری: باز / بسته / نامشخص
- Empty and error states that suggest the next action (widen radius, raise budget, try alternative).
- PWA install + location permission prompt with a manual area picker fallback.

---

## 5. Architecture

```
frontend/ (React + Vite + TS, Tailwind RTL, React Query, Leaflet)
   │  REST/JSON (+ SSE for chat streaming)
backend/ (FastAPI, Python)
   ├─ api/        search, products, shops, compare, plan, followups, chat
   ├─ core/       normaliser, ranking, geo (haversine, routing), hours
   ├─ agent/      LLM client (OpenAI-compatible), tools, prompts
   ├─ db/         SQLite + FTS5 (read-only dataset) + app tables (visit lists, follow-ups)
   └─ scripts/    build_db.py, eval_queries.py
deploy/ docker-compose.yml, Caddy (HTTPS), .env.example
```

**Agent design**: LLM never invents products/prices. It calls tools and the UI renders tool results as cards:
- `parse_query(text)` → structured filters
- `search_products(filters)`, `get_offers(product_id, location, time)`
- `find_alternatives(product_id, shop_id, reason)`
- `plan_visit(shop_ids, start_location, start_time)`
- `draft_seller_message(shop_id, product_id)`

Fallback when LLM is unavailable: rule-based parser (budget/area/time regexes + FTS) so search still works in the demo.

Config via `.env`: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

---

## 6. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Dataset inspected, DB built | `build_db.py` runs; `docs/dataset.md` lists fields + null rates |
| M1 | Search API | FTS + filters (budget, radius, open-now, conditions) return ranked offers < 300 ms |
| M2 | Frontend core | Search → product → sellers → shop card, RTL mobile, filter chips |
| M3 | Compare + map + visit list | Side-by-side compare, map pins, ordered trip with hours warnings |
| M4 | Agent | Free-text → filters chips; chat answers as cards; rule-based fallback |
| M5 | Follow-up & alternatives | Seller message drafts, stock answers recorded, alternatives ladder |
| M6 | Deploy | Docker Compose on a VPS with HTTPS; health check; seeded DB baked into image |
| M7 | Polish + demo | Empty states, loading skeletons, Persian copy review, 5-min video recorded |

Order matters: M0–M3 alone already cover most of Product/UX/Dataset points; M4–M5 add Intelligence; M6 must not be left to the last hour.

---

## 7. Testing

- Unit: Persian normaliser, hours parser (`open_now`), ranking, alternatives ordering, route ordering.
- `scripts/eval_queries.py`: ~30 realistic Persian queries with expected filters/top results; run after every parser/ranking change.
- Manual mobile check in browser devtools at 375px, light/dark.

---

## 8. Demo video (~5 min, required)

1. (0:00) Problem: in-person shopping pain points in Tehran — 20s.
2. Free-text query → editable filter chips → results with "why" lines.
3. Compare two products and three sellers; point at price-age and "unconfirmed stock" badges.
4. Map + visit list: same-mall grouping, closed-on-arrival warning, navigate deep link.
5. Ask-seller message → mark "out of stock" → alternatives appear.
6. Change budget/area/installments with one tap and show results update.
7. Close on the live URL (deploy proof) and a one-line architecture slide.

Record with voice (scores higher than silent), no code on screen.

---

## 9. Open questions / risks

- **Video's four steps** — confirm and realign section 3.
- **Dataset quality** — price outliers and stale prices (see 2.0); handle in the loader, not the UI.
- **Fake shop names/phones** — fine for demo; don't present contact buttons as verified. Final publishable contact fields to be announced.
- **Coverage gaps** — dataset is ~10% of Tehran shops from selected areas; tell users when an area has few shops instead of showing nothing.
- **LLM provider** — need base URL, key, model name; keep rule-based fallback for demo safety.
- **Hosting** — need a VPS/domain for the deploy score.

---

## 10. Build status (2026-10-22)

**Done and tested in the browser at 375px width**
- Backend (Django 6 + django-ninja): catalog build, Persian query parser, search/ranking with reasons and warnings, alternatives, trip planner, multi-item cover, seller messages, stock reports, assistant (rule-based; LLM optional via `.env`).
- Frontend (React 19 + Vite + Tailwind 4, RTL, mobile-first): Home, Results (list/map, editable chips, clarify, relax suggestions), Product (price range, seller cards, inquiry → out of stock → alternatives), Shop, Mall (by floor), Chat (multi-turn, cards, quick replies), Trip (ordered stops, arrival checks, bought/missing), shopping-list cover, Activity, Compare.
- Run locally: `npm --prefix frontend run build`, then `backend/.venv/Scripts/python backend/manage.py runserver` → http://localhost:8000 (Django serves the built app and `/api`). For frontend dev: `npm --prefix frontend run dev` on :5173 (proxies `/api` to :8000).

**Left**
1. Deploy: Dockerfile (build frontend + catalog in image), docker-compose with Caddy (HTTPS), `.env.example`, README.
2. Plug in the LLM endpoint (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) and check the chat answers.
3. Optional polish: code-split the 580 KB bundle (Leaflet lazy), WhatsApp/Bale share buttons, demo video script run-through.


## 11. Shopping UX improvements (2026-10-23)

- Seller cards expose availability evidence and required conditions first, with expandable payment/warranty/recommendation details. A shortlist combines lowest listed price, shortest estimated travel, and newest stock confirmation without duplicating a seller.
- Successful manual or seller confirmation offers concrete visit-list and navigation actions. Simulated contacts are labelled before and during the action; a price-only reply does not claim confirmed inventory or refresh an unrelated listed price.
- Exact-product alternatives can atomically replace a failed destination; existing planned destinations are reused. Alternatives obey the active requirements and prefer the same mall when the shopper is already there. Similar products require specification review; known iPhone-part and electrical-spec mismatches are excluded. Unknown compatibility still needs seller confirmation.
- The guide persists its active visit, step and outcomes, with a context-specific route cache valid for up to 24 hours. Cached address/floor/unit details can survive lost connectivity; first-time loading, current availability, neighbor fetching, and result submission still need connectivity.
- Arrival assistance prioritizes mall, floor, unit and store identity; shows three neighboring stores initially; and offers full-address, seller-contact and floor-directory recovery.
- Purchase completion and evidence recording are atomic and retry-safe. Same-store items share travel/dwell time and count as one physical stop. Remaining visits recalculate from the last visited store and current time.
- Trips show heuristic time ranges and calculation assumptions, closing-time risk and a prioritize-stop action. These ranges are estimates, not calibrated confidence intervals; no live traffic or indoor routing is available.
- Unknown in-person payment, warranty and hours information requires explicit inclusion when filtering. Explicitly unmet requirements remain excluded. Search previews count additional products needing confirmation; radius suggestions show the resulting count for the exact proposed boundary.
- Validation: backend regression tests in `catalog/test_shopping_ux.py` and `catalog/test_neighbors.py`; frontend behavioral tests via `npm test`; production build via `npm run build`.


## 12. Store maps and exact starting location (2026-10-23)

- A dedicated `/map` page and navigation tab show stores in the current viewport, including category-only shops. The local map API returns up to 250 stores with the total count and a clear truncation notice; panning, zooming and name/address search fetch that area again.
- Tapping a store opens its identity, floor/unit, address, current listed hours, navigation links, visit-list action and an explicit option to use the store as the starting point. Nearby or co-located stores are grouped and individually selectable without inventing positions inside a mall.
- Search, product, mall, trip and guide maps now use store-level selection. Search maps cover the recommended sellers for products on the current results page; the separate store map is the broader directory.
- The location picker prioritizes tapping and dragging an exact map point. It displays the coordinates, supports an optional label, keeps neighborhood/mall search and GPS as alternatives, and requires an explicit confirmation with a visible fixed footer. Neighborhood selection remains approximate until the shopper adjusts the point.
- Marker labels are HTML-escaped. Map tests cover viewport validation, Persian search, result limits, co-located store selection, zoom grouping and label safety.


## 13. Shared shopping requirements and seller comparison (2026-10-23)

- One persisted shopping context now carries budget bounds, origin/radius, visit time, travel mode, mall, purchase conditions and ranking preferences through search, product details, seller comparison, chat and alternatives. Opening a product establishes the current item for subsequent assistant questions. New item searches reset category/brand facets while keeping budget and mall requirements.
- Product, comparison and chat expose an editable requirements summary. Clearing a requirement is explicit; stale conversation filters cannot re-enable it. Persian/Arabic budget digits are accepted, reversed budget ranges are rejected, and returning to an existing search inherits requirement edits made downstream.
- Each offer card can select a seller for a comparison of up to three distinct stores for one product. Selecting another offer at the same store replaces that store's listing; exceeding three asks the shopper to remove a selection. Selections persist across refreshes.
- `/p/:id/compare-sellers?offers=...` resolves exact offer IDs into stable columns. Missing offers remain marked unavailable. Changes to requirements recompute eligibility without replacing selected sellers. The table compares current offer price, original listed price/date, stock evidence, arrival hours, travel estimate, address/floor/unit, seller title, offer warranty and declared payment conditions, with inquiry/navigation/visit-list actions.
- The product comparator now uses one eligible offer for price, seller, warranty and hours in each product column, preserving column positions when a request fails. Cheapest highlights exclude missing prices, unavailable stock, closed shops and offers outside the current requirements. Unconfirmed stock is still explicitly unconfirmed.
- Validation: production frontend build; 19 frontend behavioral tests and 31 Django regression tests; browser checks for seller selection, budget changes, exact comparison columns, history and refresh persistence. External seller messages are not sent during validation.
