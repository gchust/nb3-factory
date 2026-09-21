import type { AccessContext, Contract, Membership, Supplier } from './api.js';

function rolesInOrg(
  access: AccessContext,
  organizationId: number,
): Set<string> {
  return new Set(
    access.memberships
      .filter((membership) => membership.organizationId === organizationId)
      .map((membership) => membership.role),
  );
}

export function canManageOrganization(
  access: AccessContext | undefined,
  organizationId: number | null | undefined,
): boolean {
  if (!access) return false;
  if (access.isAdmin) return true;
  if (organizationId === null || organizationId === undefined) return false;
  return rolesInOrg(access, organizationId).has('procurement');
}

export function canReviewOrganization(
  access: AccessContext | undefined,
  organizationId: number | null | undefined,
): boolean {
  if (!access) return false;
  if (access.isAdmin) return true;
  if (organizationId === null || organizationId === undefined) return false;
  return rolesInOrg(access, organizationId).has('quality');
}

export function canManageSupplier(
  access: AccessContext | undefined,
  supplier: Pick<Supplier, 'organizationId'>,
): boolean {
  return canManageOrganization(access, supplier.organizationId);
}

export function canReviewSupplier(
  access: AccessContext | undefined,
  supplier: Pick<Supplier, 'organizationId'>,
): boolean {
  return canReviewOrganization(access, supplier.organizationId);
}

export function canManageContract(
  access: AccessContext | undefined,
  contract: Pick<Contract, 'organizationId'>,
): boolean {
  return canManageOrganization(access, contract.organizationId);
}

export function isSupplierContact(
  access: AccessContext | undefined,
  supplierId: number,
): boolean {
  if (!access) return false;
  return access.memberships.some(
    (membership: Membership) =>
      membership.role === 'supplier_contact' &&
      membership.supplierId === supplierId,
  );
}

export function organizationOptions(
  access: AccessContext | undefined,
  organizations: readonly { id: number; name: string; code: string }[],
): readonly { id: number; name: string; code: string }[] {
  if (!access || access.isAdmin) return organizations;
  const allowed = new Set(
    access.memberships
      .map((membership) => membership.organizationId)
      .filter((id): id is number => id !== null),
  );
  return organizations.filter((organization) => allowed.has(organization.id));
}
