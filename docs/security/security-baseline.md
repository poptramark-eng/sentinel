# Security Baseline

## Identity and sessions

- Build first-party authentication using vetted cryptographic libraries, not custom cryptography.
- Use Argon2id for password hashing. The initial implementation uses 19 MiB memory, 2 iterations and parallelism 1; benchmark under expected login concurrency before production and tune only with capacity evidence.
- Use short-lived access tokens and rotating, one-time refresh tokens.
- Store refresh-token hashes, not reusable raw refresh tokens.
- Deliver tokens only through secure, HTTP-only, appropriately SameSite cookies.
- Protect cookie-authenticated mutations against CSRF.
- Revoke token families on reuse detection, password reset, account suspension and logout-all.
- Do not authenticate learners with learner identifiers.

## Authorization

- Enforce authorization in API handlers/services and query scope, not only navigation.
- Derive tenant, school and assessment scope from verified membership and policy context.
- Deny by default.
- Test cross-tenant ID substitution, bulk operations, exports, nested relations and background jobs.
- Separate role permissions from resource ownership and assignment.

## Application security

- Validate DTOs at the API boundary and reject unknown fields.
- Rate-limit authentication, recovery, invitations and expensive exports.
- Use idempotency for payment and callback processing.
- Verify provider signatures and independently verify final payment status.
- Keep secrets in environment/secret managers, never source control or logs.
- Apply safe file type/size validation and malware scanning before processing uploads.

## Data protection and operations

- PostgreSQL is the system of record.
- Encrypt transport and managed database storage; verify backup encryption and restore procedures.
- Use synthetic learner data in development.
- Review Kenyan data-protection obligations, children's data requirements, processor agreements and hosting/data-transfer arrangements before real-data use.
- Define retention, correction, export and deletion policies with the data controller.
- This baseline does not claim legal compliance.

## Security acceptance gates

Authentication lifecycle tests; authorization matrix and tenant-isolation tests; CSRF, rate-limit and brute-force tests; audit completeness; backup restore rehearsal; secret scanning and dependency review; secure headers, TLS and production cookie configuration.

- Protect login and refresh with distributed Upstash Redis rate limits; fail closed in production when the rate-limit dependency is unavailable. Never trust forwarded IP headers unless the reverse-proxy trust boundary is explicitly configured.
