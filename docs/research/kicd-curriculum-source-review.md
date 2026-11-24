# KICD curriculum source review — Regular Grades 1–9

**Reviewed:** 24 November 2026  
**Track:** Regular curriculum only. Special Needs Education (SNE), pre-primary and Senior School are separate tracks and are not included in this draft catalogue.  
**Status:** Source-verified discovery; not yet a published Sentinel curriculum or an approved Council assessment subject list.

## Source hierarchy

Use the live KICD curriculum-design library as the primary source for current grade/learning-area names and available design documents. The Basic Education Curriculum Framework supplies the conceptual meaning of a learning area. KICD's approved/rationalised learning-area materials lists are useful corroboration, but a list of materials eligible for publisher submission is not, by itself, a definitive assessment-subject policy for every Council examination.

| Level | Official KICD source | What it establishes |
|---|---|---|
| Regular curriculum structure | [Regular Curriculum Designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/regular-curriculum-designs/) | Primary Grades 1–6, split into Lower Primary 1–3 and Upper Primary 4–6; Junior School Grades 7–9; Senior School 10–12. |
| Grades 1–3 | [Lower Primary](https://kicd.ac.ke/cbc-materials/lower-primary/) | Current online library groups the Grade 1–3 designs and lists English, Kiswahili, Mathematical Activities, Environmental Activities, Creative Activities, CRE, HRE, IRE and Indigenous Languages. |
| Grades 4–6 | [Upper Primary Curriculum Designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/upper-primary-designs/) | Current online library lists English, Kiswahili, Mathematics, Science and Technology, Agriculture, Social Studies, Creative Arts, CRE, HRE, IRE, Arabic, French, German, Indigenous Language and Mandarin for each of Grades 4, 5 and 6. |
| Grade 7 | [Grade Seven Designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-seven-designs/) | Grade-specific online directory lists Agriculture, Arabic, Creative Arts, CRE, English, French, German, HRE, Indigenous Language, Integrated Science, IRE, Kiswahili, Mandarin, Mathematics, Pre-Technical Studies and Social Studies. |
| Grade 8 | [Grade Eight Designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-eight-designs/) | Grade-specific directory lists the same 16 learning-area labels as Grade 7. |
| Grade 9 | [Grade Nine Designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-nine-designs/) | Grade-specific directory lists the same 16 learning-area labels as Grade 7 and Grade 8. |
| Curriculum framework | [Basic Education Curriculum Framework (2019)](https://kicd.ac.ke/wp-content/uploads/2019/08/BASIC-EDUCATION-CURRICULUM-FRAMEWORK-2019.pdf) | Defines learning areas as subjects taught at different education levels and as means for developing competencies and values. |
| Corroborating rationalisation list | [Addendum to Orange Book: approved rationalised learning-area course and complementary materials for PP1–Grade 9 (December 2024)](https://kicd.ac.ke/wp-content/uploads/2026/09/ADDENDUM-TO-ORANGE-BOOK-PP1-PP2-1-9-.pdf) | Confirms a KICD-approved rationalised learning-area/materials list covering Grades 1–9. It is a materials catalogue, so use it as corroboration rather than replacing the live curriculum-design library. |
| Publisher-submission cross-check | [Complementary Print Curriculum Support Materials Submission Guidelines (2026 Edition)](https://kicd.ac.ke/wp-content/uploads/2026/09/COMPLEMENTARY-MATERIALS-SUBMISSION-DOCUMENT-SEPTEMBER-2026.pdf) | Gives publisher submission areas grouped by education level. It is not the canonical curriculum-design source. |

## Catalogue observations

1. KICD's current online design library presents shared design collections for Grades 1–3 and Grades 4–6, and separate directories for Grades 7, 8 and 9. Sentinel still records grade applicability explicitly; shared source pages are not a reason to collapse Grade into a band in the data model.
2. The official page labels vary by level. For example, Grades 1–3 use `Mathematical Activities`; Grades 4–6 use `Mathematics`; Junior School uses `Mathematics`. Preserve source labels as display/source metadata rather than silently normalizing them into one visible label.
3. Religious education appears as separate Christian, Hindu and Islamic learning-area designs. Keep CRE, HRE and IRE distinct. Do not replace them with a generic `Religious Education` mark column.
4. Optionality is not fully represented by the directory headings. Language choices and school-specific offerings must be modelled as applicability/configuration metadata, not inferred from the mere presence of a design link.
5. The live KICD online library may be revised. A curriculum publication in Sentinel must record retrieval date, source URL, source title, source content hash, effective date where published, reviewer and version. A later source change creates a new curriculum version; it never mutates a version already referenced by an assessment.
6. The curriculum catalogue does not determine the Council's examination blueprint. A Council may assess a configured subset of grade-applicable learning areas for a given assessment, subject to the Council's authority and the selected curriculum version.
7. KICD curriculum design documents include assessment approaches/rubrics, but they do not justify hard-coding a universal Sentinel PL1–PL8 or EE/ME/AE/BE numeric threshold. Council rubric configuration remains independently versioned.

## Import artifact

`data/curriculum/kicd-regular-cbe-grades-1-9-review.csv` is a review-only extraction of the current online library labels. It deliberately marks optionality and assessment eligibility as `REVIEW_REQUIRED`. It is not a production seed. Before publication, review the actual grade design documents and confirm current terminology, language choice rules, SNE applicability, and each Council's assessment blueprint.

## Recommended import controls

A Platform Administrator curriculum import should be preview-first and versioned. It must show added/changed/removed grade mappings, duplicate canonical codes, alias changes, source hash, effective date and impact on future assessments. Publication is immutable and auditable. Existing assessments keep their original curriculum and rubric snapshots.
