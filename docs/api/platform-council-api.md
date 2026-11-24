# Platform Council and Geography API

**Status:** Implemented initial platform configuration contract.
**Base path:** `/api/platform/councils`
**Actor:** Active `PLATFORM_ADMINISTRATOR` only.
**Authentication:** First-party access cookie, exact trusted Origin and CSRF protection for mutations.

## Purpose and boundaries

Platform Administrators create Council tenant records and the Council-owned geography hierarchy used by school registration. Council Administrators do not create or modify the platform's Council tenant boundary. A Council's geography is strictly owned by that Council. A parent node from another Council is rejected.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/platform/councils` | List Councils with region and registration counts |
| `POST` | `/api/platform/councils` | Create a Council |
| `GET` | `/api/platform/councils/:councilId/geography` | Read the Council's Region → County → Subcounty → Zone → Cluster tree |
| `POST` | `/api/platform/councils/:councilId/geography/nodes` | Add one geography node under a validated parent |

## Create Council

Request:

```json
{
  "name": "Western Education Council",
  "slug": "western-education-council"
}
```

Names are trimmed. Slugs are normalized to lowercase and must contain only lowercase letters, numbers and single hyphen-separated segments. Slugs are unique. Council creation and its audit event are one transaction. New Councils start `ACTIVE`; a separate governed lifecycle is required to suspend or close one.

## Create geography node

Request:

```json
{
  "type": "COUNTY",
  "parentId": "region-uuid",
  "name": "Example County",
  "code": "optional-code"
}
```

`REGION` has no parent. Every other level requires exactly one active parent from the same Council:

| New node | Required parent |
|---|---|
| Region | None |
| County | Region |
| Subcounty | County |
| Zone | Subcounty |
| Cluster | Zone |

The server verifies the parent inside the creation transaction. Composite Council foreign keys provide database-level defense in depth. Duplicate names under the same parent return a conflict. Each successful creation writes `PLATFORM_GEOGRAPHY_NODE_CREATED` with the actor, Council, node type and parent ID in the same transaction.

## Read and access control

- All endpoints require an active PlatformOperator record with role `PLATFORM_ADMINISTRATOR`; a normal user, School Administrator or Council Administrator is denied.
- Mutations require exact trusted Origin and the CSRF double-submit token.
- Council and geography IDs are parsed as UUIDs.
- `GET /api/platform/councils` is not a public discovery endpoint. Registrants use the limited active-council and active-cluster option endpoints in `school-registration-api.md`.
- The registrant submission endpoint independently validates Council and Cluster state and same-Council ownership; hiding or tampering with UI options cannot bypass validation.

## Current limitations

This first slice supports creation and read-only inspection. Edit, merge, deactivate, reparent, bulk import and historical geography-version operations are not exposed. Do not delete or repurpose a geography node after it has been referenced by a school registration; design a governed versioning/reassignment process before those operations are introduced. Production use still requires institutional validation of the official Council/geography source and controlled data import.
