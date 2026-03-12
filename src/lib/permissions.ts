import type { ManagementPermissionKey, ManagementPermissions, Profile } from '@/types';

export type { ManagementPermissionKey, ManagementPermissions };

const ALL_KEYS: ManagementPermissionKey[] = [
  'menu', 'inventory', 'supplies', 'clients', 'discounts', 'bonus',
  'expenses', 'debtors', 'staff', 'about',
];

/** Default: full access (null or missing key = true) */
export function hasPermission(profile: Profile | null, key: ManagementPermissionKey): boolean {
  if (!profile) return false;
  if (profile.role === 'owner') return true;
  const perms = profile.permissions;
  if (!perms || typeof perms !== 'object') return true;
  const val = perms[key];
  return val !== false;
}

/** Keys that are always accessible (cash, analytics) - not in management permissions */
export const ALWAYS_ACCESSIBLE = ['cash', 'analytics'] as const;

/** Full-access default permissions object */
export function getDefaultPermissions(): ManagementPermissions {
  return Object.fromEntries(ALL_KEYS.map((k) => [k, true])) as ManagementPermissions;
}

/** Merge partial permissions with defaults (undefined = true) */
export function normalizePermissions(partial: ManagementPermissions | null | undefined): ManagementPermissions {
  const result = getDefaultPermissions();
  if (!partial || typeof partial !== 'object') return result;
  for (const k of ALL_KEYS) {
    if (partial[k] === false) result[k] = false;
  }
  return result;
}

export { ALL_KEYS };
