/**
 * The paths the materials pages answer on.
 *
 * The first is canonical and is the one the navigation entry points at; the others are aliases so
 * a link written as `/materials` or `/projectMaterials` reaches the same page instead of falling
 * back to the landing page. Pages derive their own child links from whichever alias the visitor
 * arrived on, so staying on one alias never jumps to another.
 */
export const materialListPaths = [
  '/project-materials',
  '/materials',
  '/projectMaterials',
] as const;

/** The alias the current path is under, or the canonical one when it is under none. */
export function materialListBase(pathname: string): string {
  return (
    materialListPaths.find(
      (base) => pathname === base || pathname.startsWith(`${base}/`),
    ) ?? materialListPaths[0]
  );
}

/** The create page under the same alias as `pathname`. */
export function materialCreatePath(pathname: string): string {
  return `${materialListBase(pathname)}/new`;
}

/** The detail page under the same alias as `pathname`. */
export function materialDetailPath(pathname: string, id: number): string {
  return `${materialListBase(pathname)}/${id}`;
}
