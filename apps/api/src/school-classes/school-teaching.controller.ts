import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { SchoolAssessmentMarkService } from "./school-assessment-mark.service";

@Controller("school/teaching")
@UseGuards(AccessTokenGuard, CsrfGuard)
export class SchoolTeachingController {
  constructor(private readonly marks: SchoolAssessmentMarkService) {}

  @Get("classes")
  listAssignedClasses(@Req() request: AuthenticatedRequest) {
    return this.marks.listAssignedClasses({
      accountId: request.auth!.accountId,
      personId: request.auth!.personId,
    });
  }
}
