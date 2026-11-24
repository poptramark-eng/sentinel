import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { CsrfGuard } from "../auth/csrf.guard";
import {
  AccessTokenGuard,
  AuthenticatedRequest,
} from "../auth/access-token.guard";
import { PlatformOperatorGuard } from "../auth/platform-operator.guard";
import { RegistrationDecisionDto } from "./dto/registration-decision.dto";
import { VerifySchoolIdentifierDto } from "./dto/verify-school-identifier.dto";
import { RegistrationQueryDto } from "./dto/registration-query.dto";
import { SchoolRegistrationService } from "./school-registration.service";

@Controller("platform/school-registrations")
@UseGuards(AccessTokenGuard, PlatformOperatorGuard, CsrfGuard)
export class PlatformSchoolRegistrationsController {
  constructor(
    private readonly registrations: SchoolRegistrationService,
  ) {}

  @Get()
  list(@Query() query: RegistrationQueryDto) {
    return this.registrations.listForReview(query);
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.registrations.getForReview(id);
  }

  @Post(":id/verify-identifier")
  verifyIdentifier(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: VerifySchoolIdentifierDto,
  ) {
    return this.registrations.verifySchoolIdentifier(
      {
        accountId: request.auth!.accountId,
        personId: request.auth!.personId,
      },
      id,
      body.identifierId,
      body.reason,
    );
  }

  @Post(":id/approve")
  approve(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: RegistrationDecisionDto,
  ) {
    return this.registrations.decide(
      {
        accountId: request.auth!.accountId,
        personId: request.auth!.personId,
      },
      id,
      "APPROVED",
      body,
    );
  }

  @Post(":id/reject")
  reject(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: RegistrationDecisionDto,
  ) {
    return this.registrations.decide(
      {
        accountId: request.auth!.accountId,
        personId: request.auth!.personId,
      },
      id,
      "REJECTED",
      body,
    );
  }
}
