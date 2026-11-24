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
| `POST` | `/api/platform/councils/:councilId/geography/import/preview` | Validate CSV-derived geography paths without writing data |
| `POST` | `/api/platform/councils/:councilId/geography/import` | Atomically create missing hierarchy nodes from validated paths |

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

## CSV import

The Platform Council workspace supports importing a geography hierarchy from a CSV file exported from the institution's spreadsheet. The required columns are exactly `region,county,subcounty,zone,cluster`, with one row per Cluster path. Column order may vary; duplicate or missing headers are rejected. Quoted values, commas inside quoted values, and line breaks inside quoted cells are supported. Malformed quoting is rejected.

Limits: 1 MB file size, at most 2,000 data rows, 120 characters per geography name. The browser parses the CSV locally and sends structured rows; the file itself is not uploaded or retained. Names are trimmed, internal whitespace is collapsed, and matching is case-insensitive. Repeated rows and repeated parent paths are deduplicated.

Preview reuses existing active nodes, identifies inactive-name conflicts and reports the number of distinct Cluster paths and new nodes at each level. Preview performs no writes. The commit endpoint repeats validation and rechecks Council status inside a PostgreSQL `SERIALIZABLE` transaction (10-second acquisition wait and 60-second execution timeout). It creates only missing nodes, reuses existing case-insensitive matches, and writes one audit event containing the row count and creation counts. Any failure rolls back the entire import. A concurrent geography change returns a conflict and requires a fresh preview.

A 2 MiB API request-body limit accommodates JSON expansion of the maximum CSV payload. The server still enforces the 2,000-row and field-length limits independently. Export `.xlsx` as `.csv` before importing; no Excel binary or third-party spreadsheet parser is required.

## Read and access control

- All endpoints require an active PlatformOperator record with role `PLATFORM_ADMINISTRATOR`; a normal user, School Administrator or Council Administrator is denied.
- Mutations require exact trusted Origin and the CSRF double-submit token.
- Council and geography IDs are parsed as UUIDs.
- `GET /api/platform/councils` is not a public discovery endpoint. Registrants use the limited active-council and active-cluster option endpoints in `school-registration-api.md`.
- The registrant submission endpoint independently validates Council and Cluster state and same-Council ownership; hiding or tampering with UI options cannot bypass validation.

## Current limitations

This slice supports creation, read-only inspection and validated atomic CSV import. Edit, merge, deactivate, reparent and historical geography-version operations are not exposed. Do not delete or repurpose a geography node after it has been referenced by a school registration; design a governed versioning/reassignment process before those operations are introduced. Production use still requires institutional validation of the official Council/geography source and controlled data import.
