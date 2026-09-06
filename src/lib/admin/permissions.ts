/**
 * Admin roles and permissions — the vocabulary every /api/admin route checks.
 *
 * WHY A FLAT PERMISSION LIST. Roles are what an operator assigns; permissions
 * are what a route enforces. Keeping them separate means a route never has to
 * know which roles exist ("can this caller approve withdrawals?" is a single
 * question), and adding a role later is a change to ONE table below, not a
 * hunt through fifty handlers.
 *
 * SUPER ADMIN BY DEFAULT. users.role = 'admin' with admin_role NULL is a super
 * admin. Every admin that existed before roles were introduced therefore keeps
 * exactly the access they had; narrowing someone is an explicit act recorded
 * in the audit log.
 *
 * Enforced server-side in requireAdmin(). The UI reads the same table to
 * decide what to draw, but hiding a button is a courtesy, not a control.
 */

export const ADMIN_ROLES = [
  "super_admin",
  "finance_admin",
  "operations_admin",
  "support_admin",
  "moderator",
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  finance_admin: "Finance Admin",
  operations_admin: "Operations Admin",
  support_admin: "Support Admin",
  moderator: "Moderator",
};

export const PERMISSIONS = [
  "dashboard.view",
  "search.use",
  "users.view",
  "users.edit",
  "users.block",
  "users.unblock",
  "users.suspend",
  "users.note",
  "compliance.view",
  "compliance.review",
  "pools.view",
  "pools.edit",
  "pools.pause",
  "pools.cancel",
  "pools.complete",
  "pools.reopen",
  "games.view",
  "games.sync",
  "winners.view",
  "winners.recalculate",
  "transactions.view",
  "transactions.refund",
  "withdrawals.view",
  "withdrawals.approve",
  "withdrawals.reject",
  "withdrawals.hold",
  "withdrawals.retry",
  "moderation.view",
  "moderation.manage",
  "promotions.view",
  "promotions.manage",
  "settings.view",
  "settings.manage",
  "admins.view",
  "admins.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  super_admin: ALL,
  finance_admin: [
    "dashboard.view",
    "search.use",
    "users.view",
    "pools.view",
    "winners.view",
    "transactions.view",
    "transactions.refund",
    "withdrawals.view",
    "withdrawals.approve",
    "withdrawals.reject",
    "withdrawals.hold",
    "withdrawals.retry",
    "promotions.view",
    "audit.view",
  ],
  operations_admin: [
    "dashboard.view",
    "search.use",
    "users.view",
    "pools.view",
    "pools.edit",
    "pools.pause",
    "pools.cancel",
    "pools.complete",
    "pools.reopen",
    "games.view",
    "games.sync",
    "winners.view",
    "winners.recalculate",
    "transactions.view",
    "withdrawals.view",
    "moderation.view",
    "promotions.view",
    "promotions.manage",
    "settings.view",
    "audit.view",
  ],
  support_admin: [
    "dashboard.view",
    "search.use",
    "users.view",
    "users.edit",
    "users.block",
    "users.unblock",
    "users.suspend",
    "users.note",
    "compliance.view",
    "compliance.review",
    "pools.view",
    "winners.view",
    "transactions.view",
    "withdrawals.view",
    "moderation.view",
    "audit.view",
  ],
  moderator: [
    "dashboard.view",
    "search.use",
    "users.view",
    "users.suspend",
    "pools.view",
    "moderation.view",
    "moderation.manage",
  ],
};

/** users.role decides IF someone is an admin; admin_role decides WHICH kind. */
export function resolveAdminRole(row: {
  role?: string | null;
  admin_role?: string | null;
}): AdminRole | null {
  if (row.role !== "admin") return null;
  const narrowed = row.admin_role;
  if (narrowed && (ADMIN_ROLES as readonly string[]).includes(narrowed)) {
    return narrowed as AdminRole;
  }
  return "super_admin";
}

export function permissionsFor(role: AdminRole | null): readonly Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  role: AdminRole | null,
  permission: Permission | readonly Permission[]
): boolean {
  if (!role) return false;
  const granted = ROLE_PERMISSIONS[role];
  const wanted = Array.isArray(permission) ? permission : [permission];
  return (wanted as readonly Permission[]).every((p) => granted.includes(p));
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}
