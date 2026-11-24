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
import { SchoolRegistrationService } from "./school-registration.service";
import { RegistrationQueryDto } from "./dto/registration-query.dto";
import { SubmitSchoolRegistrationDto } from "./dto/submit-registration.dto";
import { WithdrawRegistrationDto } from "./dto/registration-decision.dto";

@Controller("school-registrations")
@UseGuards(AccessTokenGuard, CsrfGuard)
export class SchoolRegistrationsController {
  constructor(
    private readonly registrations: SchoolRegistrationService,
  ) {}

  @Post()
  submit(
    @Req() request: AuthenticatedRequest,
    @Body() body: SubmitSchoolRegistrationDto,
  ) {
    return this.registrations.submit(
      {
        accountId: request.auth!.accountId,
        personId: request.auth!.personId,
      },
      body,
    );
  }

  @Get("mine")
  listMine(
    @Req() request: AuthenticatedRequest,
    @Query() query: RegistrationQueryDto,
  ) {
    return this.registrations.listMine(
      {
        accountId: request.auth!.accountId,
        personId: request.auth!.personId,
      },
      query,
    );
  }

  @Get("mine/:id")
  getMine(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.registrations.getMine(
      {
        accountId: request.auth!.accountId,
        personId: request.auth!.personId,
      },
      id,
    );
  }

  @Post(":id/withdraw")
  withdraw(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: WithdrawRegistrationDto,
  ) {
    return this.registrations.withdraw(
      {
        accountId: request.auth!.accountId,
        personId: request.auth!.personId,
      },
      id,
      body,
    );
  }
}
