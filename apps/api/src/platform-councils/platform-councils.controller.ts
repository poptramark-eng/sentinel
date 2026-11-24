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
import { PlatformOperatorGuard } from "../auth/platform-operator.guard";
import { CreateCouncilDto } from "./dto/create-council.dto";
import { CreateGeographyNodeDto } from "./dto/create-geography-node.dto";
import { GeographyImportDto } from "./dto/geography-import.dto";
import { PlatformCouncilService } from "./platform-council.service";

@Controller("platform/councils")
@UseGuards(AccessTokenGuard, PlatformOperatorGuard, CsrfGuard)
export class PlatformCouncilsController {
  constructor(private readonly councils: PlatformCouncilService) {}

  @Get()
  list() {
    return this.councils.list();
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateCouncilDto,
  ) {
    return this.councils.create(
      { accountId: request.auth!.accountId },
      body,
    );
  }

  @Get(":councilId/geography")
  getGeography(@Param("councilId", new ParseUUIDPipe()) councilId: string) {
    return this.councils.getGeography(councilId);
  }

  @Post(":councilId/geography/import/preview")
  previewGeographyImport(
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Body() body: GeographyImportDto,
  ) {
    return this.councils.previewGeographyImport(councilId, body);
  }

  @Post(":councilId/geography/import")
  importGeography(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Body() body: GeographyImportDto,
  ) {
    return this.councils.importGeography(
      { accountId: request.auth!.accountId },
      councilId,
      body,
    );
  }

  @Post(":councilId/geography/nodes")
  createGeographyNode(
    @Req() request: AuthenticatedRequest,
    @Param("councilId", new ParseUUIDPipe()) councilId: string,
    @Body() body: CreateGeographyNodeDto,
  ) {
    return this.councils.createGeographyNode(
      { accountId: request.auth!.accountId },
      councilId,
      body,
    );
  }
}
