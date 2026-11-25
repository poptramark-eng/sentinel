import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { LinkTeacherDto } from "./dto/link-teacher.dto";
import { SchoolTeacherService } from "./school-teacher.service";

@Controller("school/registrations/:registrationId/teachers")
@UseGuards(AccessTokenGuard, CsrfGuard)
export class SchoolTeachersController {
  constructor(private readonly teachers: SchoolTeacherService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
  ) {
    return this.teachers.list(
      { accountId: request.auth!.accountId, personId: request.auth!.personId },
      registrationId,
    );
  }

  @Post()
  link(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Body() body: LinkTeacherDto,
  ) {
    return this.teachers.invite(
      { accountId: request.auth!.accountId, personId: request.auth!.personId },
      registrationId,
      { email: body.email, givenName: body.givenName, familyName: body.familyName },
    );
  }
}
