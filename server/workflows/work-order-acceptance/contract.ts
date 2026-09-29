/**
 * Contract between the acceptance workflow Run module and the application.
 *
 * A Run module is copied into its workflow Artifact and, in a production
 * build, loaded from that materialized Artifact instead of from this source
 * tree. A relative import that leaves the workflow package therefore resolves
 * outside the Artifact and fails, so the module reads its service key from
 * here and resolves the published service through the engine's read-only
 * `options.services` resolver. The application publishes the service under
 * this key beside its typed token in `server/providers/service-domain.ts`,
 * which reads the same literal from `server/service/constants.ts`.
 *
 * This file must stay self-contained: it is copied into the Artifact, and any
 * import leaving this package would not resolve from the materialized path.
 * Keep the literal in sync with `SERVICE_DOMAIN_SERVICE_KEY` in
 * `server/service/constants.ts`; both name the same published service.
 */
export const SERVICE_DOMAIN_SERVICE_KEY = 'app/service-domain';

/** The slice of the application's service-domain service this node uses. */
export interface AcceptanceService {
  acceptWorkOrder(
    orderId: string,
    actorId: string | undefined,
    options: { auto?: boolean; assigneeId?: string },
  ): Promise<{ status?: unknown } | undefined>;
}
