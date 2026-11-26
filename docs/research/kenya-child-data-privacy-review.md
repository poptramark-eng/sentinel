# Kenya child-data privacy review for Sentinel

**Reviewed:** 24 November 2026  
**Scope:** Learner identity, candidate registration, marks, assessment results and reports for Grades 1–9.  
**Status:** Engineering research and release gate, not a legal opinion or a completed Data Protection Impact Assessment (DPIA).

## Official source hierarchy

1. [Data Protection Act, No. 24 of 2019 — ODPC copy](https://odpc.go.ke/wp-content/uploads/2024/02/TheDataProtectionAct__No24of2019.pdf), especially sections 25 (principles), 26 (data subject rights), 30 (lawful basis), 31 (DPIA), 32 (conditions of consent), 33 (children's data), 41 (data protection by design/default) and 48 (transfers outside Kenya).
2. [ODPC Guidance Notes for Processing Children's Data (2025)](https://www.odpc.go.ke/wp-content/uploads/2025/11/ODPC-%E2%80%93-Guidance-Note-for-Processing-Childrens-Data.pdf). This explains the distinction between a lawful basis and parental/guardian consent, best-interest assessment, verification of parent/guardian authority, age verification, DPIA, minimisation, retention, security and children's rights.
3. [ODPC — Data Protection Laws in Kenya](https://www.odpc.go.ke/data-protection-laws-kenya/index.html), which links the Data Protection (General) Regulations, 2021 and the registration and enforcement regulations.
4. [ODPC — Rights of a Data Subject](https://odpc.go.ke/rights-of-a-data-subject/index.html), including how a parent or guardian exercises rights on behalf of a minor.
5. [ODPC — FAQs on registration of data controllers and processors](https://odpc.go.ke/faqs/index.html). The ODPC describes educational institutions as examples of data controllers and cloud-computing providers as examples of processors.

## Findings that affect the product

### 1. Lawful basis and parental/guardian consent are separate

The 2025 ODPC guidance says the handler must identify a lawful basis under section 30 and, in addition, obtain explicit/verifiable parental or guardian consent before processing children's personal data. Where a non-consent lawful basis applies (for example, legal obligation or public task), the guidance treats parental/guardian consent as a separate safeguard/notification mechanism rather than automatically as the primary lawful basis. Do not collapse these two records into one generic `consentGiven` flag.

A Council's public-interest purpose, a school's statutory duties, or a contract must not be assumed to establish the correct lawful basis without review of the specific parties, legal authority, purposes and processing operations.

### 2. Best-interest assessment and DPIA before learner data

The ODPC guidance places the child's best interests first and directs handlers to assess impacts on children's rights and conduct a DPIA before processing. It specifically highlights the scale and sensitivity of education-related child data, the need for technical/organisational safeguards and the need to review third-party processors.

Sentinel must not onboard real learner records, candidate identifiers, marks or results until the controller/processor roles, lawful basis, parent/guardian notification and consent mechanism, DPIA, retention schedule and security controls have been reviewed and approved by the responsible legal/privacy owner.

### 3. Verify parent/guardian authority and age proportionately

The guidance requires reasonable, proportionate verification that the person giving consent is the parent or guardian. Examples include signed forms, verified email, identity documents, third-party verification or electronic signatures. It also requires age-verification mechanisms appropriate to the technology, volume, proportion of children's data and potential harm. Verification must itself follow data minimisation.

Do not collect full birth certificates, parent ID scans or dates of birth by default merely because they are possible verification methods. Select the least intrusive method that the DPIA and legal review find sufficient. Keep evidence of verification separate from learner academic records and restrict access to it.

### 4. Minimise learner identity data

The ODPC guidance gives an education-platform example that a unique identifier can be used instead of a child's full name where the full name is not necessary. Sentinel should therefore default to:

- an internal opaque LearnerIdentity ID;
- an issuer-scoped external learner identifier only where needed for matching/verification;
- the minimum grade/class/candidate linkage required for the assessment purpose;
- assessment marks and result data with narrow role/scope access.

Do not require learner login accounts in the current product scope. A learner identifier is a locator, never a password, OTP destination or bearer credential. Avoid storing date of birth, home address, parent contacts, photographs, health/disability details, ethnicity or religious belief unless a specific approved purpose and lawful basis requires it. CRE/HRE/IRE enrolment/assessment choice must not be treated as permission to infer a learner's religion.

### 5. Parent/guardian rights and transparent notices

The ODPC guidance states that access, rectification, restriction and deletion requests for a minor should be handled by a parent or legal guardian whose authority is appropriately identified, with the child's best interests considered. The platform needs a documented request/appeal workflow, identity and authority verification, response deadlines and audit trail before real learner data is used.

Privacy information must explain the controller/processor identities, each purpose, data categories, automated decision-making/human review where relevant, sharing with Councils/schools/organizers/providers, transfers, retention and rights. New purposes or expanded processing require a fresh legal assessment and, where appropriate, additional consent.

### 6. Security, retention, sensitive data and transfers

- Encrypt data in transit and at rest; pseudonymise identifiers in analytics, exports and support workflows; use least-privilege RBAC and school/Council/assessment scope; audit access and exports.
- Keep a retention schedule by data category and purpose. Delete or anonymise learner data once no longer necessary, subject to a documented legal-retention basis. Do not invent one global retention period.
- Treat health, biometric, ethnicity, religious-belief and similar child data as sensitive. Exclude these categories from the initial product unless specifically required and separately approved.
- Review each hosting, email, SMS, analytics, support and backup provider as a potential processor/subprocessor. Determine storage and access locations and assess section 48 cross-border transfer safeguards before sending personal data outside Kenya.
- Establish breach detection, response, notification and evidence-preservation procedures before production onboarding.

## Sentinel release gates

| Gate | Required evidence | Owner to confirm |
|---|---|---|
| Controller/processor mapping | Written determination of which Council, school, organizer and Sentinel entity determines purposes/means; data-processing agreements and subprocessor list | Legal/privacy owner + participating institutions |
| Lawful basis and purpose | Per-operation lawful basis and purpose register; no blanket assumed basis | Each controller with legal review |
| Child best-interest assessment and DPIA | Documented child-rights risk assessment and completed DPIA; regulator consultation where legally required | Controller(s) + DPO/privacy owner |
| Parent/guardian notice and consent | Clear notice, proportionate age/authority verification, versioned evidence, withdrawal/request workflow | Controller(s) |
| Data subject rights | Verified parent/guardian request, correction, restriction, deletion/retention exception and appeal workflows | Controller(s) + platform operator |
| Minimisation and identifiers | Approved learner fields, issuer catalogue, duplicate-resolution and non-authentication rules | Product/data owner + privacy owner |
| Retention and deletion | Approved category-specific schedule, legal holds, secure deletion/anonymisation and backup expiry | Controller(s) + platform operator |
| Security and processors | Threat model, access matrix, encryption, audit, incident plan, processor due diligence, cross-border transfer assessment | Security owner + DPO |
| ODPC registration | Determine and complete applicable controller/processor registration and renewals | Each legal entity, with counsel |

## Implementation boundary

The current SchoolClass and StaffAssignment features do not create learner records and may be developed with synthetic data. Production learner, candidate, marks and results endpoints are protected by `ChildDataProcessingGuard` and fail closed unless `CHILD_DATA_PROCESSING_ENABLED=true` is explicitly configured. The default production state is disabled. The flag must not be enabled until the responsible controllers/processors and privacy/legal owners have evidenced and approved all applicable gates above; setting the flag is an operational release action, not proof that the gates are satisfied. LearnerEnrollment, LearnerIdentity onboarding, candidate scheduling/snapshots, marks persistence, result publication, parent access and production analytics must remain blocked from real data until approval. Non-production environments remain available for synthetic fixtures only; never use real learner information in test fixtures.

This document should be revisited with Kenyan counsel and the relevant Council/school data protection officers before pilot onboarding. It does not determine the legal controller/processor allocation or substitute for registration, contracts, DPIA or legal advice.
