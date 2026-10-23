export type OpenState = "open" | "closed" | "closing_soon" | "open_no_hours" | "unknown";

export interface ShopStatus {
  state: OpenState;
  label: string;
  next_open?: string | null;
  closes?: string;
}

export interface Payments {
  torobpay: "in_person" | "unknown_channel" | null;
  installments: { provider: string; in_person: boolean }[];
  declared: boolean;
}

export interface Shop {
  shop_id: string;
  name: string;
  name_verified: boolean;
  address: string | null;
  area: string | null;
  lat: number;
  lon: number;
  mall: string | null;
  mall_key: string | null;
  floor: string | null;
  floor_rank: number | null;
  floor_label: string | null;
  unit: string | null;
  phone: string | null;
  instagram: string | null;
  website: string | null;
  distance_km: number | null;
  travel_min: number | null;
  status: ShopStatus;
  hours_known: boolean;
  payments: Payments;
  fast_delivery: boolean | null;
  offer_count: number;
  nav: { neshan?: string; balad?: string; google?: string };
  week?: { day: string; key: string; text: string; state: string }[];
  categories?: string[];
}

export interface PriceAge {
  days: number | null;
  level: "fresh" | "recent" | "old" | "stale" | "unknown";
  label: string;
  at?: string;
}

export interface Warranty {
  provider: string | null;
  months: number | null;
  description: string | null;
  label: string;
  has: boolean;
}

export interface Stock {
  state: "unconfirmed" | "confirmed" | "out" | "price_changed";
  label: string;
  by_seller?: boolean;
  at?: string;
  price?: number;
}

export interface Offer {
  offer_id: string;
  seller_title: string;
  description: string | null;
  price: number | null;
  listed_price: number | null;
  price_status: string;
  price_vs_median: number | null;
  price_age: PriceAge;
  warranty: Warranty | null;
  stock: Stock;
  score: number;
  reasons: string[];
  warnings: string[];
  shop: Shop;
  filters?: Record<string, boolean>;
  matches_filters?: boolean;
  condition_states?: Record<string, "confirmed" | "unknown" | "rejected">;
}

export interface ProductSummary {
  pid: number;
  product_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  image: string | null;
  offer_count: number;
  min_price: number | null;
  median_price: number | null;
  max_price: number | null;
}

export interface ProductResult extends ProductSummary {
  score: number;
  matching_offers: number;
  price_from: number | null;
  price_to: number | null;
  nearest_km: number | null;
  open_count: number;
  best: Offer;
  why: string;
}

export interface CategoryShops {
  categories: string[];
  count: number;
  shops: Shop[];
  note: string;
}

export interface Chip {
  key: string;
  label: string;
}

export interface SearchResponse {
  keywords: string;
  match_mode: string;
  total: number;
  unknown_matches?: number;
  products: ProductResult[];
  facets: {
    categories: { name: string; count: number }[];
    brands: { name: string; count: number }[];
    malls: { key: string; name: string; count: number }[];
  };
  relax: { filter: string; label: string; products: number; value?: number }[];
  category_shops: CategoryShops | null;
  notices: string[];
  filters?: Filters;
  chips?: Chip[];
  understood?: string[];
  after_hours?: AfterHours | null;
}

export interface HubShop {
  shop_id: string;
  name: string;
  lat: number;
  lon: number;
  distance_km: number | null;
  status: ShopStatus;
  mall: string | null;
  floor_label: string | null;
  unit: string | null;
  phone: string | null;
  nav: Shop["nav"];
  on_torob: boolean;
}

export interface AfterHours {
  visit_label: string;
  near_km: number;
  message: string;
  closed_near_count: number;
  closed_near: { shop: Shop; price: number | null; product_title: string }[];
  open_far: { product: { product_id: string; title: string; image: string | null }; offer: Offer }[];
  hub: {
    name: string; lat: number; lon: number; distance_km: number; radius_m: number; matching: number; open_count: number;
    unknown_count: number; listed_count: number; categories: string[]; shops: HubShop[]; note: string;
  } | null;
  me: { lat: number; lon: number };
}

export interface ProductDetail extends ProductSummary {
  images: string[];
  specs: { section: string; items: { key: string; value: string }[] }[];
  price_stats: {
    min: number | null;
    max: number | null;
    median: number | null;
    count: number;
    freshest_days: number | null;
    fair_range: [number, number] | null;
  };
  offers: Offer[];
  category_shops: CategoryShops | null;
}

export interface SimilarProduct extends ProductSummary {
  differences?: { key: string; original: string | null; alternative: string | null }[];
  similarity: number;
  price_diff_pct: number | null;
  matching_offers: number;
  best: Offer;
  why: string;
}

export interface BestNext {
  kind: "same_mall" | "same_product" | "similar";
  headline: string;
  tradeoff: string;
  offer: Offer;
  product: SimilarProduct | null;
}

export interface Alternatives {
  best_next: BestNext | null;
  product: Pick<ProductSummary, "product_id" | "title" | "image" | "category" | "brand" | "median_price">;
  same_product: Offer[];
  same_mall: Offer[];
  similar: SimilarProduct[];
  category_shops: CategoryShops | null;
}

export interface Filters {
  q?: string;
  category?: string | null;
  brand?: string | null;
  mall?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  area?: string | null;
  lat?: number | null;
  lon?: number | null;
  radius?: number | null;
  open?: boolean;
  visit_at?: string | null;
  visit_label?: string | null;
  installments?: boolean;
  torobpay?: boolean;
  warranty?: boolean;
  fast?: boolean;
  include_unknown?: boolean;
  priority?: "balanced" | "price" | "near" | "reliable" | null;
  mode?: "taxi" | "walk" | "metro" | null;
  sort?: "relevance" | "price_asc" | "price_desc" | "near" | null;
}

export interface Visit {
  id: number;
  shop_id: string;
  product_id: string;
  offer_id: string;
  state: "planned" | "visited" | "bought" | "skipped";
  paid_price: number | null;
  product_title: string | null;
  image: string | null;
  listed_price: number | null;
  created_at: string;
  updated_at?: string;
  shop_name?: string | null;
}

export interface Leg {
  visit_id: number;
  shop_id: string;
  product_id: string;
  offer_id: string;
  product_title: string | null;
  image: string | null;
  listed_price: number | null;
  shop: Shop;
  floor_move?: string | null;
  travel_km: number;
  travel_min: number;
  arrive_at: string;
  arrive_label: string;
  status_on_arrival: ShopStatus;
  same_mall_as_previous: boolean;
  same_store_as_previous?: boolean;
  closing_risk?: boolean;
  travel_min_range?: [number, number] | null;
  travel_known?: boolean;
}

export interface JourneyOutcome {
  title: string; shop: string; kind: "bought" | "missing" | "skipped"; paid?: number | null;
}
export interface Journey {
  activeVisitId: number | null; step: number; total: number; outcomes: JourneyOutcome[];
  cachedPlan: TripPlan | null; cacheKey: string; savedAt: string | null;
}

export interface TripPlan {
  legs: Leg[];
  warnings: string[];
  total_min: number;
  stop_count?: number;
  total_min_range?: [number, number];
  assumptions?: string;
  total_km?: number;
  places?: number;
  malls?: number;
  end_at?: string;
  route_url?: string | null;
}

export interface CoverPlan {
  place_keys: string[];
  places: string[];
  covered: number;
  missing: string[];
  total_price: number;
  picks: { product_id: string; title: string; offer: Offer; place: string }[];
  summary: string;
  total_min: number;
  total_km: number | null;
  end_at: string | null;
  order: { name: string; mall: string | null; floor_label: string | null; unit: string | null; arrive_label: string; status: string }[];
  warnings: string[];
  tags?: string[];
  extra_vs_cheapest?: number;
}

export interface SellerMessage {
  text: string;
  questions: string[];
  phone: string | null;
  links: { call: string | null; sms: string | null; whatsapp: string | null };
  note: string;
}

export interface AssistantReply {
  reply: string;
  state: Record<string, unknown>;
  filters: Filters;
  chips: Chip[];
  search: SearchResponse | null;
  alternatives: Alternatives | null;
  clarify: string[];
  suggestions: string[];
  action: string | null;
  llm: boolean;
}

export interface Meta {
  stats: { shops: number; listing_shops: number; products: number; offers: number; latest_price: string; built_at: string };
  llm: boolean;
  llm_hint?: string | null;
  categories: { name: string; offers: number }[];
  malls: { key: string; name: string; shops: number; lat: number; lon: number }[];
  areas: { label: string; lat: number; lon: number; shops: number }[];
}

export interface Place {
  label: string;
  kind: "area" | "mall" | "landmark";
  lat: number;
  lon: number;
  shops: number | null;
}

export type InquiryChannel = "sms" | "call";
export type StockAnswer = "in_stock" | "out_of_stock" | "price_changed";

export interface Inquiry {
  id: number;
  token: string;
  channel: InquiryChannel;
  shop_id: string;
  shop_name: string | null;
  shop_phone: string | null;
  product_id: string;
  product_title: string | null;
  image: string | null;
  listed_price: number | null;
  status: "sent" | "failed" | "answered" | "expired";
  status_label: string;
  answer: StockAnswer | null;
  answer_price: number | null;
  answer_note: string;
  summary: string;
  message: string;
  receptor: string;
  provider: string;
  simulated: boolean;
  error: string;
  reply_path: string;
  seen: boolean;
  created_at: string;
  answered_at: string | null;
}

export interface SellerInquiry {
  shop_name: string | null;
  item: string;
  product_title: string | null;
  image: string | null;
  listed_price: number | null;
  visit_label: string;
  channel: InquiryChannel;
  script: string | null;
  asked_at: string;
  status: Inquiry["status"];
  answer: StockAnswer | null;
  answer_price: number | null;
  can_answer: boolean;
}

export interface NeighborShop {
  shop_id: string;
  name: string;
  floor_label: string | null;
  unit: string | null;
  same_floor: boolean;
}
