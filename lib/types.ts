/**
 * Shapes mirror the Module 2 Flask/SQLAlchemy `to_dict()` output field for field, so the
 * frontend can point at the real API later without touching a single component.
 */
import type { Role } from "./roles";
import type { SpecRow } from "./specs";

export type { SpecRow };

export type OrderStatus = "pending" | "paid" | "shipped" | "delivered" | "cancelled";

export type { Role };

export interface Category {
  category_id: number;
  category_name: string;
  description: string | null;
  created_at: string;
}

export interface CategoryDetail extends Category {
  products: Product[];
  product_count: number;
}

export interface Product {
  product_id: number;
  category_id: number;
  product_name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
  /*
   * Storefront detail: the manufacturer's page, a credited summary, the gallery and the spec
   * table. The Flask API always returns them (migration 8f3a0c2d5b71); optional here so code
   * that builds a product (forms, tests) needn't fill them in.
   */
  /** the manufacturer's own product page */
  official_url?: string | null;
  /** a short overview, usually the manufacturer's published summary */
  overview?: string | null;
  /** where the overview was taken from, shown as a credit; null if written in-house */
  overview_source?: string | null;
  /** gallery, first = primary. Only this app's own AVIF paths (uploads are converted on arrival) */
  images?: string[];
  /** the manufacturer's technical specifications, as label/value rows */
  specs?: SpecRow[];
  /** the page the specs were taken from - the product page, or a separate spec page */
  specs_source?: string | null;
  /**
   * Variants (migration b5e2c7a91d04): the choices in display order, and one row per buyable
   * combination. With variants, `price` is the lowest active variant's price and
   * `stock_quantity` their total, so lists and cards read the product as before.
   */
  option_groups?: OptionGroup[];
  variants?: ProductVariant[];
}

/** One choice a buyer makes, e.g. { name: "Capacity", values: ["1TB", "2TB"] }. */
export interface OptionGroup {
  name: string;
  values: string[];
}

/** One buyable combination, e.g. { "Capacity": "2TB" }, with its own price and stock. */
export interface ProductVariant {
  variant_id: number;
  options: Record<string, string>;
  price: number;
  stock_quantity: number;
  /** one of the product's images, shown when this variant is picked */
  image: string | null;
  /** false once retired: it stays because past orders point at it, but can't be bought */
  is_active: boolean;
}

/** Gallery size limit, shared by the API's validation and the dashboard's image manager. */
export const MAX_PRODUCT_IMAGES = 12;

/** What POST /products and PUT /products/:id accept. */
export interface ProductInput {
  product_name: string;
  category_id: number;
  price: number;
  stock_quantity: number;
  description?: string;
  is_active?: boolean;
  official_url?: string | null;
  overview?: string | null;
  overview_source?: string | null;
  images?: string[];
  specs?: SpecRow[];
  specs_source?: string | null;
  /** sent together; with variants, price and stock_quantity are derived by the API */
  option_groups?: OptionGroup[];
  variants?: VariantInput[];
}

/** A variant as the product form sends it: no id yet for a new one. */
export interface VariantInput {
  variant_id?: number;
  options: Record<string, string>;
  price: number;
  stock_quantity: number;
  image?: string | null;
  is_active?: boolean;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role?: Role;
}

export interface UserRecord extends User {
  phone_number: string | null;
  address: string | null;
  role: Role;
  created_at: string;
}

export interface OrderItem {
  order_item_id: number;
  product_id: number;
  product_name: string;
  /** the variant bought and its label at the time, e.g. "2TB · White"; null without variants */
  variant_id?: number | null;
  variant_label?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface Order {
  order_id: number;
  user_id: number;
  username?: string;
  order_status: OrderStatus;
  total_amount: number;
  shipping_address: string;
  ordered_at: string;
  item_count?: number;
  /** for the shipping label: who receives it (recorded at checkout) and how it travels */
  recipient_name?: string | null;
  recipient_phone?: string | null;
  courier?: Courier | null;
  tracking_number?: string | null;
}

/** The couriers an order can be shipped with - the API's list. */
export const COURIERS = ["JNE", "J&T Express", "SiCepat", "AnterAja", "Pos Indonesia", "GoSend", "GrabExpress", "Other"] as const;
export type Courier = (typeof COURIERS)[number];

export interface OrderDetail extends Order {
  items: OrderItem[];
  /** the account's phone, for orders placed before recipient_phone was recorded */
  customer_phone?: string | null;
}

/** What POST /orders accepts. The owner is the signed-in customer, taken from the token. */
export interface OrderInput {
  shipping_address: string;
  recipient_name: string;
  recipient_phone: string;
  items: { product_id: number; variant_id?: number; quantity: number }[];
}

export interface CartItem {
  product_id: number;
  product_name: string;
  /** set for a product with variants: which one, and its label ("2TB · White") */
  variant_id?: number;
  variant_label?: string;
  price: number;
  quantity: number;
  stock_quantity: number;
}

/** Every Flask error body carries `error`; the rest depends on the endpoint. */
export interface ApiErrorBody {
  error: string;
  details?: string[];
  fields?: string[];
  id?: number;
  active_orders?: number;
  product_count?: number;
}

/** Availability is derived, never stored - a union so every branch is handled. */
export type Availability = "in-stock" | "low-stock" | "out-of-stock" | "unavailable";
