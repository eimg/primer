export const UNKNOWN_OWNER_ERROR = "CC_IMPORT_017";

export interface TenantUser {
  id: string;
  email: string;
  active: boolean;
}

export type OwnerResult =
  | { ok: true; ownerId: string }
  | { ok: false; code: typeof UNKNOWN_OWNER_ERROR; message: string };

/**
 * Missing owner input deliberately falls back to the importing user.
 * An explicit but unknown owner is a data-quality failure and must not fall back.
 */
export function mapOwner(
  ownerEmail: string | undefined,
  importingUserId: string,
  tenantUsers: TenantUser[],
): OwnerResult {
  const requested = ownerEmail?.trim().toLowerCase();
  if (!requested) return { ok: true, ownerId: importingUserId };

  const owner = tenantUsers.find(
    (user) => user.active && user.email.trim().toLowerCase() === requested,
  );
  if (!owner) {
    return {
      ok: false,
      code: UNKNOWN_OWNER_ERROR,
      message: `Owner email ${requested} is not an active ClientCore user`,
    };
  }
  return { ok: true, ownerId: owner.id };
}

