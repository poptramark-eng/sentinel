import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { AssignClassTeacherDto } from "./dto/assign-class-teacher.dto";
import { CreateSchoolClassDto } from "./dto/create-school-class.dto";
import { SchoolClassService } from "./school-class.service";

@Controller("school/registrations/:registrationId/classes")
@UseGuards(AccessTokenGuard, CsrfGuard)
export class SchoolClassesController {
  constructor(private readonly classes: SchoolClassService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param("registrationId", new ParseUUIDPipe()) registrationId: string) {
    return this.classes.list({ accountId: request.auth!.accountId, personId: request.auth!.personId }, registrationId);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Body() body: CreateSchoolClassDto,
  ) {
    return this.classes.create({ accountId: request.auth!.accountId, personId: request.auth!.personId }, registrationId, body);
  }

  @Post(":classId/class-teacher")
  assignClassTeacher(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("classId", new ParseUUIDPipe()) classId: string,
    @Body() body: AssignClassTeacherDto,
  ) {
    return this.classes.assignClassTeacher({ accountId: request.auth!.accountId, personId: request.auth!.personId }, registrationId, classId, body);
  }

  @Delete(":classId/class-teacher")
  endClassTeacher(
    @Req() request: AuthenticatedRequest,
    @Param("registrationId", new ParseUUIDPipe()) registrationId: string,
    @Param("classId", new ParseUUIDPipe()) classId: string,
  ) {
    return this.classes.endClassTeacher({ accountId: request.auth!.accountId, personId: request.auth!.personId }, registrationId, classId);
  }
}
