import { WorkspaceShell, type WorkspaceNavItem } from "./workspace-shell";
import type { ReactNode } from "react";

type CouncilSection = "curriculum" | "assessments" | "rubrics" | "rubric-review";

interface CouncilWorkspaceShellProps {
  councilId: string;
  active: CouncilSection;
  children: ReactNode;
}

export function CouncilWorkspaceShell({ councilId, active, children }: CouncilWorkspaceShellProps) {
  const base = `/council/${councilId}`;
  const navigation: WorkspaceNavItem[] = [
    { label: "Assessments", href: `${base}/assessments`, active: active === "assessments" },
    { label: "Curriculum", href: `${base}/curriculum`, active: active === "curriculum" },
    { label: "Grading rubrics", href: `${base}/rubrics`, active: active === "rubrics" },
    { label: "Independent review", href: `${base}/rubric-review`, active: active === "rubric-review" },
  ];

  return (
    <WorkspaceShell
      section="Council workspace"
      title="Assessment governance"
      navigation={navigation}
    >
      {children}
    </WorkspaceShell>
  );
}
