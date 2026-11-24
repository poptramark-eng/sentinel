# Authentication API — Sentinel

**Status:** Implemented API contract for account onboarding and the first-party authentication foundation. Password recovery, MFA and full role/permission enforcement are separate work.

Base path: `/api/auth`

All browser mutation endpoints require an exact trusted `Origin` (or trusted `Referer`) matching `WEB_ORIGIN`. Refresh and authenticated mutations additionally require the CSRF double-submit token. The browser must use `credentials: "include"`; access and refresh tokens are HttpOnly cookies and are never returned in JSON.

## Account onboarding

### `POST /register`

Creates a global Person and pending UserAccount only. It does not create a CouncilMembership, SchoolMembership, role, school, or school-management permission.

Request:

```json
{
  "givenName": "Amina",
  "familyName": "Example",
  "email": "amina@example.org",
  "password": "a-long-unique-password"
}
```

- Given/family names: 1–80 characters.
- Email: normalized to lowercase; maximum 254 characters.
- Password: 12–128 characters; stored with Argon2id.
- Response: `202 Accepted` with a generic `VERIFICATION_REQUIRED` response whether or not the email already exists.
- If a new account was created, an email verification message is sent. Duplicate addresses do not trigger another send; use the resend endpoint.
- In non-production only, when `DEV_EMAIL_PREVIEW=true`, the response may include `verificationPreviewUrl`. This is a local test convenience and is never returned in production.

### `POST /verify-email`

Request:

```json
{ "token": "<43-character-base64url-token>" }
```

- Response: `200 OK`, `{ "status": "EMAIL_VERIFIED" }`.
- Invalid, expired, consumed or mismatched tokens return a generic `400` response.
- Token lifetime: 24 hours. A successful verification consumes the token, verifies the email LoginIdentifier and activates the UserAccount atomically.
- The token is random and high entropy. Only its HMAC-SHA256 hash is stored. A composite foreign key prevents a token from being linked to an identifier belonging to a different account.
- A PostgreSQL partial unique index allows at most one unconsumed token per identifier; resend consumes older tokens before inserting a replacement.

### `POST /resend-verification`

Request:

```json
{ "email": "amina@example.org" }
```

- Response: `202 Accepted` with the same generic response used by registration.
- Unknown, already verified and ineligible accounts do not disclose their state.
- For an eligible pending account, older unconsumed tokens are invalidated before a fresh 24-hour token is issued.

## Session endpoints

| Method and path | Purpose | Protection |
|---|---|---|
| `GET /csrf` | Issue a CSRF token cookie and response value | Trusted origin |
| `POST /login` | Authenticate verified active email account | Trusted origin; distributed IP + email rate limits |
| `POST /refresh` | Rotate one-time refresh token | CSRF + distributed IP rate limit |
| `POST /logout` | Revoke current device's refresh-token family | Access token + CSRF |
| `POST /logout-all` | Revoke all refresh-token families and bump auth version | Access token + CSRF |
| `GET /me` | Return current account and active scoped memberships | Access token |

## Rate-limit policies

| Action | Limit |
|---|---|
| Registration | 5/IP/hour and 3/normalized email/hour |
| Email verification | 20/IP/15 minutes |
| Verification resend | 5/IP/hour and 3/normalized email/hour |
| Login | 30/IP/15 minutes and 5/normalized email/15 minutes |
| Refresh | 60/IP/5 minutes |

Email identifiers are HMACed with `REFRESH_TOKEN_PEPPER` before they become Redis keys; production requires at least 32 bytes of pepper. Limits use Upstash sliding windows. `TRUST_PROXY` defaults to false; if a reverse proxy is used, configure an explicit trusted proxy IP/CIDR allowlist. Wildcard proxy trust is rejected. Production fails closed with `503` when Upstash credentials are missing or the limiter is unavailable; exceeded limits return `429` and `Retry-After`.

## Email delivery configuration

Production API runtime requires:

- `RESEND_API_KEY` — use a sending-only key scoped to the verified sender domain;
- `EMAIL_FROM` — verified sender address/domain;
- `WEB_APP_URL` — canonical HTTPS frontend origin used to build verification links.

Development may set `DEV_EMAIL_PREVIEW=true` to return a local verification URL without contacting Resend. This is ignored in production. No Resend API key or domain has been provisioned by this repository change.

## Security and lifecycle notes

- Account registration never assigns a role. After verification, the person may submit a school registration request; that registration and its initial SchoolAdministrator membership remain pending until PlatformAdministrator approval.
- Generic registration/resend responses reduce email account enumeration.
- The verification page requires an explicit click; page prefetch/link scanners do not consume tokens.
- The verification page uses `Referrer-Policy: no-referrer` because its URL contains a short-lived token.
- Email delivery occurs after the account/token transaction. If the provider is unavailable, the failure is logged without recipient/token details and the endpoint retains its generic `202 Accepted` response; the account remains pending and a fresh link can be requested when delivery recovers. Delivery timing can still differ for eligible and ineligible addresses, so generic responses reduce but do not eliminate all enumeration side channels.
- Do not use real learner data for account tests. Do not expose the API to production until password recovery, full authorization, abuse monitoring and operational controls are complete.
