# Assessment Notifications

## First delivery event

When a Council assessment is scheduled, Sentinel creates one durable email-delivery record for each active School Administrator who:
- belongs to an approved school registration in the same Council;
- has an active account; and
- has a verified email login identifier.

Teachers and learner contacts are not included in this first notification audience. A global teacher identity is not notified merely because it exists; future teacher-facing events must use the active school assignment and relevant assessment scope.

## Delivery lifecycle

The assessment state change, audit event and notification outbox records are committed in the same serializable database transaction. Email delivery happens only after commit, so a provider outage cannot undo a valid assessment schedule.

The first provider is Resend, using the existing `RESEND_API_KEY` and `EMAIL_FROM` configuration. If either is missing, notifications remain queued. A provider acceptance changes the record to `SENT`; this is not a claim that the recipient opened or read the email. Provider rejection changes it to `FAILED`.

Each recipient/assessment pair has a unique idempotency key. Provider state changes are recorded in `AuditEvent` with the notification delivery ID, provider, template and provider message ID where available. Recipient email and name are stored as delivery-time snapshots so later profile edits do not rewrite the delivery history.

## Operational boundary

The current slice dispatches queued messages immediately after assessment scheduling. It does not yet include a scheduled retry worker or Resend webhook receiver; failed deliveries therefore remain visible for the next operational tooling milestone. Do not manually mark a failed message as delivered. Add webhook signature verification and provider event idempotency before using delivery receipts to transition records to `DELIVERED`.

Email remains a transactional channel here. SMS is a separate provider-neutral integration planned behind the SMS interface documented in [provider research](./provider-research.md); Africa's Talking remains the researched Kenya-first candidate, subject to account approval and current pricing confirmation. No credits, sender IDs or paid provider services are activated by this implementation.