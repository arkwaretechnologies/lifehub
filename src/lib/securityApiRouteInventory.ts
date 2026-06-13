/**
 * Inventory of `/api/*` routes that rely on privileged server access (service role or filesystem templates).
 * All routes except `/api/auth/login` expect `Authorization: Bearer <JWT>` via Next.js middleware (`src/middleware.ts`).
 *
 * Classification:
 * - **Public (no JWT):** `POST|GET /api/auth/login`
 * - **Authenticated (JWT):** default — middleware-enforced
 * - **Admin JWT:** user provisioning, password reset for others, RBAC mutations — enforced in handlers via `assertAdminSession` in `src/lib/adminRole.ts`
 */

export const SECURITY_API_ROUTE_GROUPS = {
  noJwt: ["/api/auth/login"],
  adminMutations: [
    "POST /api/users",
    "PATCH /api/users/[userId] (others)",
    "POST /api/roles",
    "PATCH /api/roles/[roleId]",
    "DELETE /api/roles/[roleId]",
    "PUT /api/roles/[roleId]/pages",
  ],
  selfOrAdmin: [
    "PATCH /api/users/[userId] (self password)",
    "POST /api/user-profile (self or admin)",
  ],
  serviceRoleViaDirectClient: [
    "/api/auth/session",
    "/api/user-profile",
    "/api/users",
    "/api/users/[userId]",
    "/api/roles",
    "/api/roles/[roleId]",
    "/api/roles/[roleId]/pages",
    "/api/role-menu-access",
    "/api/dashboard/summary",
    "/api/settings/laboratory/**",
    "/api/settings/clinical-print-layouts",
    "/api/clinical-print-layouts/**",
    "/api/laboratory/**",
    "/api/imaging/**",
    "/api/cashier/**",
    "/api/auth/login",
  ],
  serviceRoleViaLib: [
    "/api/reception/** (receptionQueueServer)",
    "/api/consultation/** (if applicable)",
    "/api/pharmacy/** (pharmacyPosDb)",
    "/api/consultation-template",
    "/api/prescription-template",
    "/api/laboratory/lab-result-template",
    "/api/tts/elevenlabs",
  ],
} as const;
