import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "../auth/access-token.guard";
import { CouncilAdministratorGuard } from "../auth/council-administrator.guard";
import { CsrfGuard } from "../auth/csrf.guard";
import { SelectCouncilCurriculumDto } from "./dto/select-council-curriculum.dto";
import { UpdateCouncilGradeAreaDto } from "./dto/update-council-grade-area.dto";
import { CouncilCurriculumService } from "./council-curriculum.service";

@Controller("councils/:councilId/curriculum")
@UseGuards(AccessTokenGuard, CouncilAdministratorGuard, CsrfGuard)
export class CouncilCurriculaController {
  constructor(private readonly curricula: CouncilCurriculumService) {}

  @Get()
  getCurrent(@Param("councilId", new ParseUUIDPipe()) councilId: string) {
    return this.curricula.getCurrent(councilId);
  }

  @Put()
  selectVersion(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Body() body: SelectCouncilCurriculumDto,
  ) {
    return this.curricula.selectVersion({ accountId: request.auth!.accountId }, councilId, body);
  }

  @Patch("grade-areas/:councilGradeAreaId")
  updateGradeArea(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Param("councilGradeAreaId", new ParseUUIDPipe()) councilGradeAreaId: string,
    @Body() body: UpdateCouncilGradeAreaDto,
  ) {
    return this.curricula.updateGradeArea(
      { accountId: request.auth!.accountId },
      councilId,
      councilGradeAreaId,
      body,
    );
  }
}
