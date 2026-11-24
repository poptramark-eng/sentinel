# Integration Provider Research — Initial Findings

**Reviewed:** 2026-11-24  
**Status:** Preliminary research; validate prices and commercial terms before procurement.

## 1. Safaricom Daraja

Official portal: https://developer.safaricom.co.ke/

Safaricom currently presents Daraja 3.0 as its developer platform for M-PESA APIs, including sandbox application creation and API testing. The public portal landing page is accessible, but detailed API reference pages and account-specific production requirements must be verified inside the developer portal before coding against endpoint contracts.

Implementation requirements:
- Keep sandbox and production base URLs/configuration separate.
- Keep OAuth credentials server-side; obtain short-lived access tokens and cache only until expiry with a safety margin.
- Implement STK Push as an asynchronous payment request, not proof of settlement.
- Persist provider request identifiers and our own immutable transaction reference.
- Accept callbacks on a public HTTPS endpoint, validate expected business identifiers and amount/currency, and process idempotently.
- Verify final transaction status using the supported Daraja query/confirmation mechanism before granting paid value.
- Store callback evidence securely for a limited audit period, redact secrets and unnecessary personal data, and reconcile pending transactions.
- Add C2B validation/confirmation, reversals and transaction status query only where the merchant use case and Daraja product support require them.
- Do not deploy production callbacks or live credentials until merchant account, shortcode, callback registration and production approval are confirmed.

## 2. Kenyan SMS provider comparison

### Preliminary recommendation: Africa's Talking

Reasons:
- Public developer documentation and API examples for SMS.
- Callback configuration and delivery-report concepts are documented.
- Published Kenya bulk SMS pricing surfaced during research with tiered rates by network and volume.
- The surfaced Kenya pricing table lists KES 0.80 per Safaricom SMS at the lowest tier, reducing to KES 0.40 at the highest tier; Airtel/local and other Kenyan networks have separate rates. Sender ID setup is separately priced (e.g. KES 14,100 bundled Safaricom + Airtel; KES 8,700 single-network Safaricom or Airtel). Confirm current rates, taxes, eligibility and sender ID terms directly before purchase.

References:
- https://africastalking.ug/sms/bulksms?lang=en
- https://help.africastalking.com/en/articles/2206161-how-do-i-configure-my-callback-url
- https://help.africastalking.com/en/articles/16150386-messaging-error-codes

### Safaricom Business Bulk SMS

Safaricom offers a direct business bulk SMS product. Its public page describes application, business account, prepayment and sender ID requirements, and states that recipient lists are subject to regulatory opt-in/approval expectations. This may suit a Safaricom-only arrangement but needs confirmation of API integration, network coverage, operational reporting and exact commercial terms.

Reference: https://www.business.safaricom.co.ke/products/bulksms

### Twilio

Twilio's public Kenya pricing page surfaced an outbound SMS rate of USD 0.3134 for international numbers, with per-segment billing and possible carrier fees. That is materially higher than the Africa's Talking Kenya-local tariff table for the current Kenya-focused use case. Twilio remains a credible alternative for multi-country expansion or an existing Twilio estate, but is not the cost-first initial choice for Kenyan domestic school notifications.

Reference: https://www.twilio.com/en-us/sms/pricing/ke

### SMS implementation decision

Build a provider-neutral SmsProvider interface and delivery service that records message intent, recipient, provider reference, status transitions and delivery callbacks. Start with Africa's Talking behind the adapter after account approval and live pricing confirmation. Do not buy credits or request sender ID activation without explicit owner approval.

Do not treat an API response meaning sent or submitted as handset delivery. Persist asynchronous delivery reports and distinguish queued, submitted, delivered, rejected, failed and expired outcomes. Implement opt-in/consent and suppression rules before bulk messaging.

## 3. Paystack

Official Kenya documentation confirms supported online payment methods include M-PESA, cards, Airtel Money and PesaLink, with checkout and Charge API integration options. Paystack's documented flow is backend initialization, customer completion and server-side verification/webhook processing. Verify successful status, expected amount and currency before granting value. Webhook signatures must be validated against the raw request body; handlers should acknowledge quickly and process idempotently.

References:
- https://paystack.com/docs/v2/ke/payments/
- https://paystack.com/docs/payments/accept-payments/
- https://paystack.com/docs/v2/ke/developer-tools/integration/webhooks
- https://paystack.com/docs/payments/verify-payments/

## 4. Privacy and children's data

Kenya's Data Protection Act, 2019 includes specific provisions for processing children's personal data. ODPC's 2025 guidance highlights lawful basis, parental/guardian consent where applicable, best interests of the child, purpose limitation, data minimisation, accuracy, deletion/anonymisation, security safeguards and safeguards for transfers.

References:
- https://odpc.go.ke/wp-content/uploads/2024/02/TheDataProtectionAct__No24of2019.pdf
- https://www.odpc.go.ke/wp-content/uploads/2025/11/ODPC-%E2%80%93-Guidance-Note-for-Processing-Childrens-Data.pdf

This is a technical research note, not legal advice or a compliance certification. Determine controller/processor roles, lawful bases, retention, consent/notice obligations, DPIA applicability and data transfer/hosting requirements with qualified privacy counsel before production learner data is loaded.