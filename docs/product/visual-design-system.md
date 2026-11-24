# Softflix cbe — Visual Design System

**Status:** Foundation approved for implementation  
**Product:** cbe  
**Company:** Softflix  
**Repository:** sentinel  
**Theme:** Light, balanced, institutional, task-first

## 1. Design intent

cbe is an assessment operations platform used by examination councils, school administrators and educators. Its interface must communicate trust and control without feeling bureaucratic or visually heavy.

The experience should feel like a carefully designed professional operations workspace: calm surfaces, clear hierarchy, compact but readable data, predictable navigation and strong feedback. It is not a marketing-dashboard template and should not optimize for decorative charts or oversized KPI cards.

## 2. Brand expression

- Use **Softflix** as the company endorsement in the product shell, sign-in and public footer.
- Use **cbe** as the product name and primary product mark.
- Keep the product mark typographic until a real vector identity is approved. Do not invent a complex mascot or emblem.
- Product language should be direct, calm and action-oriented. Prefer “Review submission” to “Manage your workflow”.

## 3. Color tokens

| Role | Token | Value | Intended use |
|---|---|---|---|
| Primary | `--brand` | `#1D4ED8` | Main actions, active navigation, links |
| Primary strong | `--brand-strong` | `#1E40AF` | Hover/pressed states, high-emphasis text |
| Primary subtle | `--brand-soft` | `#EFF6FF` | Selected rows, active navigation background |
| Accent | `--accent` | `#0F766E` | Secondary highlights, supporting data series |
| Main text | `--ink` | `#172B4D` | Body and heading text |
| Muted text | `--muted` | `#64748B` | Supporting copy and metadata |
| Canvas | `--canvas` | `#F5F7FA` | Application background |
| Surface | `--surface` | `#FFFFFF` | Cards, menus, forms, tables |
| Border | `--line` | `#E2E8F0` | Dividers and control boundaries |
| Success | `--success` | `#166534` | Approved, complete, successful |
| Warning | `--warning` | `#B45309` | Pending, attention, approaching deadline |
| Danger | `--danger` | `#B91C1C` | Rejected, failed, destructive action |

Color must never be the only way to communicate state. Pair semantic colors with text labels and, where useful, icons. Avoid gradients, glowing backgrounds and large saturated decorative areas in operational screens.

## 4. Typography

- Use the existing system-first Inter stack; do not add a font dependency for the redesign foundation.
- Use a compact, readable scale: page title 28–32px, section title 18–20px, card title 14–16px, body 14px, supporting metadata 12–13px.
- Use 600–700 weights for hierarchy; avoid excessive all-caps labels.
- Use tabular numerals for marks, counts, IDs and monetary values.
- Keep body line-height around 1.5 and avoid long measure in explanatory text.

## 5. Layout and composition

### Authenticated workspace

- Desktop: fixed-width left navigation (approximately 256px), top utility bar (approximately 64px), flexible content region.
- Navigation should group destinations by role and work area. Do not expose links that the current actor cannot use.
- The top bar should contain the current organisation/context, notifications and account actions.
- Content should use a consistent page header: breadcrumb/context, title, concise description and one primary action.
- Use a responsive drawer or compact navigation on small screens. Do not force wide data-entry tables into phone layouts.

### Page composition

1. Orientation: breadcrumb or current workspace context.
2. Task: title, short description and primary action.
3. Context: filters, selected assessment/class/school and relevant status.
4. Work surface: table, form, review panel or report.
5. Feedback: validation, saved state, submission status and next action.

Avoid unnecessary hero banners inside operational pages. Dashboard metrics should only appear when they help the user decide what to do next.

## 6. Surfaces, shape and visual depth

- Use white surfaces on a cool, low-contrast canvas.
- Prefer a 1px border and subtle shadow over floating, heavily elevated cards.
- Standard radii: 8px controls, 12px compact panels, 16px primary cards.
- Use spacing in a consistent 4px rhythm; common gaps are 8, 12, 16, 24 and 32px.
- Keep decoration restrained. Depth comes from surface layering, borders and a small number of intentional shadows—not blur glows or glass effects.

## 7. Data-dense workflows

- Marks entry is a productivity surface: keyboard-first navigation, clear active cell, row identity always visible, compact columns, autosave/save feedback, recoverable errors and explicit submission.
- Keep filters visible and preserve them while navigating or correcting data.
- Put validation feedback next to the affected field or row.
- Tables need clear headers, alignment, row hover/focus, empty/loading/error states and responsive overflow behavior.
- Use tabular numerals and right-align numeric values.
- Never imply that marks entry automatically publishes results.

## 8. Charts and reporting

- Charts should answer a specific operational question and include labels, units, time period and accessible text alternatives.
- Use the primary blue for the main series and teal for a meaningful comparison; reserve semantic colors for actual status meaning.
- Avoid 3D charts, decorative gauges and chartjunk.
- Reports should prioritize printable hierarchy, consistent page breaks, clear source/assessment metadata and legible tables.

## 9. Interaction and accessibility

Target WCAG 2.2 AA. In particular:
- Normal text contrast at least 4.5:1; large text at least 3:1.
- Visible keyboard focus and logical focus order.
- Interactive targets at least 24×24 CSS pixels unless a documented exception applies; aim for 40–44px for primary touch actions.
- Do not hide focused controls behind sticky navigation or dialogs.
- Every form field has a persistent label; errors identify the field and explain correction.
- Status is conveyed with text, not color alone.
- Respect reduced-motion preferences; transitions should be brief and nonessential.

## 10. Implementation constraints

- Preserve domain behavior, API contracts, route semantics, authorization and data lifecycle.
- Do not add a component library or new runtime dependency for visual work without a separate decision.
- Prefer small reusable components and semantic CSS tokens over copying new arbitrary color values into every page.
- Keep the current public routes, authenticated workflows, print behavior and mobile support.
- Use synthetic data only in design previews and automated UI tests.

## 11. Design references

- W3C, WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C, WCAG 2.2 Quick Reference: https://www.w3.org/WAI/WCAG22/quickref/
- Material Design 3, theming and color roles: https://developer.android.com/codelabs/m3-design-theming

These references inform accessibility, semantic color roles and consistent typography tokens; cbe retains its own product-specific visual identity.


## 12. Implementation status — 25 November 2026

The first Astryx UI unification increment is implemented on `feat/astryx-ui-unification` and tracked in draft PR #5.

- Added a shared typographic cbe brand lockup and applied it to the public landing page, authentication screens and shared workspace shell.
- Reworked the public landing page to use the approved Softflix cbe identity, semantic design tokens and restrained institutional composition.
- Aligned sign-in and account-registration presentation with the common palette and product identity without changing authentication or verification behavior.
- Replaced legacy hard-coded palette values in Platform curriculum, school registration, school classes, teacher and school assessment screens with semantic tokens.
- Added reusable field, button and status primitives to the existing global stylesheet for gradual adoption by remaining screens.
- Added reduced-motion handling and retained the existing Next.js, React and Tailwind CSS stack.

This is a progressive migration, not a claim that every route has been fully rebuilt. The Council workspace screens were previously aligned in PR #3; Council/geography setup is in PR #4. Remaining work includes applying the shared shell to all school administration routes, migrating the data-entry and marks surfaces to shared controls, and completing browser/device/print QA.

No API contracts, route semantics, authorization, data lifecycle, assessment calculations, or persistence behavior were intentionally changed. PR #5 is stacked on PR #4. CI has not yet run for PR #5 because its base is the preceding feature branch; run the repository validation after the stack is ready to target `main`.
