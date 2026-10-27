/**
 * Roles and what each one may do.
 *
 * The Module 2 Flask model stores `role` as a plain string that defaults to "customer", so
 * these three values drop straight into that column. Everything in the app asks `can()` rather
 * than comparing role strings, so a permission can be moved between roles in one place here.
 *
 * Checked twice, as a permission check has to be: the UI hides what you may not do
 * (components/auth/Guards.tsx, the dashboard nav), and every write endpoint re-checks it
 * server-side (lib/server/auth.ts) - a hidden button is a convenience, not a lock.
 *
 * No imports: scripts and both sides of the app load this file.
 */

export type Role = "superadmin" | "admin" | "customer";

/** Most privileged first - the order the dashboard and the role picker list them in. */
export const ROLES: Role[] = ["superadmin", "admin", "customer"];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  customer: "Customer",
};

export const ROLE_BLURB: Record<Role, string> = {
  superadmin: "Everything an admin can do, plus user accounts, roles, passwords, and the store settings.",
  admin: "The shop floor: products and stock, categories, orders, and the homepage and About content.",
  customer: "Shopping and ordering, and their own orders, profile and password.",
};

export type Permission =
  /** create, edit and delete products - including stock, images and specifications */
  | "products:write"
  | "categories:write"
  /** move an order along, cancel it, fix its shipping address */
  | "orders:manage"
  /** the homepage and About page content */
  | "content:write"
  /** shop name, logo, time zone, contact details */
  | "settings:write"
  /** list users, change their role, reset their password */
  | "users:manage"
  /** buy: add to cart, check out, place an order. Customers only - staff run the shop, they don't shop in it */
  | "orders:place";

/** The permissions that come with a dashboard. */
export const STAFF_PERMISSIONS: Permission[] = [
  "products:write",
  "categories:write",
  "orders:manage",
  "content:write",
  "settings:write",
  "users:manage",
];

export const PERMISSIONS: Permission[] = [...STAFF_PERMISSIONS, "orders:place"];

export const PERMISSION_LABEL: Record<Permission, string> = {
  "products:write": "Products & stock",
  "categories:write": "Categories",
  "orders:manage": "Orders",
  "content:write": "Homepage & About",
  "settings:write": "Store settings",
  "users:manage": "Users & roles",
  "orders:place": "Place orders",
};

const STAFF: Permission[] = ["products:write", "categories:write", "orders:manage", "content:write"];

const GRANTS: Record<Role, Permission[]> = {
  superadmin: STAFF_PERMISSIONS,
  admin: STAFF,
  customer: ["orders:place"],
};

export const grantsOf = (role: Role): Permission[] => GRANTS[role] ?? [];

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role ? grantsOf(role).includes(permission) : false;
}

/** Anyone with a dashboard: admins and superadmins. Customers never see it. */
export const isStaff = (role: Role | null | undefined): boolean =>
  Boolean(role) && grantsOf(role as Role).some((p) => STAFF_PERMISSIONS.includes(p));

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as string[]).includes(v);
