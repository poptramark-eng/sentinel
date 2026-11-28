export type AssessmentReportSnapshot = {
  assessment: {
    id: string;
    title: string;
    assessment_type: "formative" | "summative";
    assessment_date: string | null;
    max_score: number;
    academic_year_id: string;
  };
  class: {
    id: string;
    display_name: string;
    grade_level: number;
    stream: string | null;
  };
  learning_areas: Array<{ id: string; code: string | null; name: string }>;
  learners: Array<{
    id: string;
    admission_number: string;
    name: string;
    gender: "female" | "male" | "other" | "undisclosed" | null;
    average: number | null;
    scores: Array<{
      learning_area_id: string;
      learning_area_name: string;
      score: number;
    }>;
  }>;
};

export function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const safe = /^[\t\r ]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function assessmentSnapshotToCsv(snapshot: AssessmentReportSnapshot): string {
  const header = ["Learner", "Admission number", "Gender", ...snapshot.learning_areas.map((area) => area.name), "Average"];
  const rows = snapshot.learners.map((learner) => {
    const scoreByArea = new Map(learner.scores.map((score) => [score.learning_area_id, score.score]));
    return [
      learner.name,
      learner.admission_number,
      learner.gender ?? "Not recorded",
      ...snapshot.learning_areas.map((area) => scoreByArea.get(area.id) ?? ""),
      learner.average ?? "",
    ];
  });
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
