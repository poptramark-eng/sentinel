import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "@cbe/database";
import { EnrollLearnerDto } from "./dto/enroll-learner.dto";

interface SchoolActor { accountId: string; personId: string }

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}


function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') {
      if (field.length) throw new BadRequestException("CSV contains a quote inside an unquoted field.");
      quoted = true;
    } else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new BadRequestException("CSV contains an unclosed quoted field.");
  row.push(field.trim());
  if (row.some((cell) => cell.length)) rows.push(row);
  return rows;
}

function displayName(person: { displayName: string | null; givenName: string; otherNames: string | null; familyName: string }) {
  return person.displayName?.trim() || [person.givenName, person.otherNames, person.familyName].filter(Boolean).join(" ");
}

@Injectable()
export class LearnerEnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveAdminScope(client: Pick<PrismaService["client"], "schoolMembership">, actor: SchoolActor, registrationId: string) {
    const membership = await client.schoolMembership.findFirst({
      where: {
        registrationId,
        personId: actor.personId,
        role: "SCHOOL_ADMINISTRATOR",
        status: "ACTIVE",
        endsAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        registration: { is: { status: "APPROVED", school: { is: { status: "ACTIVE" } }, council: { is: { status: "ACTIVE" } } } },
      },
      select: {
        id: true,
        registrationId: true,
        councilId: true,
        registration: { select: { school: { select: { id: true, name: true } }, council: { select: { id: true, name: true } } } },
      },
    });
    if (!membership) throw new ForbiddenException("An active School Administrator membership for an approved school is required.");
    return membership;
  }

  private async resolveClassAccess(actor: SchoolActor, registrationId: string, classId: string) {
    const now = new Date();
    const schoolClass = await this.prisma.client.schoolClass.findFirst({
      where: {
        id: classId,
        registrationId,
        status: "ACTIVE",
        registration: { is: { status: "APPROVED", school: { is: { status: "ACTIVE" } }, council: { is: { status: "ACTIVE" } } } },
      },
      select: {
        id: true, registrationId: true, councilId: true, grade: true, academicYear: true, streamCode: true, displayName: true,
        registration: { select: { school: { select: { id: true, name: true } } } },
      },
    });
    if (!schoolClass) throw new NotFoundException("The class was not found in an approved school.");

    const administrator = await this.prisma.client.schoolMembership.findFirst({
      where: {
        registrationId, councilId: schoolClass.councilId, personId: actor.personId,
        role: "SCHOOL_ADMINISTRATOR", status: "ACTIVE", endsAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      },
      select: { id: true },
    });
    if (!administrator) {
      throw new ForbiddenException("An active School Administrator membership is required to access learner rosters.");
    }
    return { schoolClass, accessRole: "SCHOOL_ADMINISTRATOR" as const };
  }

  async searchExisting(actor: SchoolActor, registrationId: string, query: string) {
    await this.resolveAdminScope(this.prisma.client, actor, registrationId);
    const normalized = query.trim();
    if (normalized.length < 2) throw new BadRequestException("Search with at least two characters.");
    const learners = await this.prisma.client.learner.findMany({
      where: {
        OR: [
          // A known system identifier may be used for a transfer across schools.
          { learnerNumber: { equals: normalized, mode: "insensitive" } },
          // Name search is restricted to identities already associated with this school.
          {
            AND: [
              { enrollments: { some: { registrationId } } },
              { OR: [
                { givenName: { contains: normalized, mode: "insensitive" } },
                { familyName: { contains: normalized, mode: "insensitive" } },
                { otherNames: { contains: normalized, mode: "insensitive" } },
              ] },
            ],
          },
        ],
      },
      take: 10,
      orderBy: [{ familyName: "asc" }, { givenName: "asc" }],
      select: { id: true, learnerNumber: true, givenName: true, otherNames: true, familyName: true, displayName: true, enrollments: { where: { status: "ACTIVE", endedAt: null }, select: { registrationId: true } } },
    });
    return learners.map((learner) => ({
      id: learner.id,
      learnerNumber: learner.learnerNumber,
      name: displayName(learner),
      alreadyEnrolledAtThisSchool: learner.enrollments.some((enrollment) => enrollment.registrationId === registrationId),
      hasActiveEnrollment: learner.enrollments.length > 0,
    }));
  }

  async listClassLearners(actor: SchoolActor, registrationId: string, classId: string) {
    const { schoolClass, accessRole } = await this.resolveClassAccess(actor, registrationId, classId);
    const enrollments = await this.prisma.client.schoolLearnerEnrollment.findMany({
      where: { registrationId, councilId: schoolClass.councilId, schoolClassId: classId, status: "ACTIVE", endedAt: null },
      orderBy: [{ learner: { familyName: "asc" } }, { learner: { givenName: "asc" } }],
      select: {
        id: true, admissionNumber: true, enrolledAt: true,
        learner: { select: { id: true, learnerNumber: true, givenName: true, otherNames: true, familyName: true, displayName: true } },
      },
    });
    return {
      school: schoolClass.registration.school,
      class: { id: schoolClass.id, grade: schoolClass.grade, academicYear: schoolClass.academicYear, streamCode: schoolClass.streamCode, displayName: schoolClass.displayName },
      accessRole,
      learners: enrollments.map((enrollment) => ({
        enrollmentId: enrollment.id,
        learnerId: enrollment.learner.id,
        learnerNumber: enrollment.learner.learnerNumber,
        name: displayName(enrollment.learner),
        admissionNumber: enrollment.admissionNumber,
        enrolledAt: enrollment.enrolledAt,
      })),
    };
  }

  async endEnrollment(
    actor: SchoolActor,
    registrationId: string,
    enrollmentId: string,
    status: "TRANSFERRED" | "WITHDRAWN" | "COMPLETED",
    reason: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const scope = await this.resolveAdminScope(tx, actor, registrationId);
      const enrollment = await tx.schoolLearnerEnrollment.findFirst({
        where: { id: enrollmentId, registrationId: scope.registrationId, councilId: scope.councilId, status: "ACTIVE", endedAt: null },
        select: { id: true, learnerId: true, schoolClassId: true, learner: { select: { learnerNumber: true } } },
      });
      if (!enrollment) throw new NotFoundException("An active learner enrollment was not found in this school.");
      const endedAt = new Date();
      const updated = await tx.schoolLearnerEnrollment.update({
        where: { id: enrollment.id },
        data: { status, endedAt },
        select: { id: true, status: true, endedAt: true },
      });
      const withdrawnCandidates = await tx.assessmentCandidate.updateMany({
        where: {
          enrollmentId: enrollment.id,
          status: "ACTIVE",
          assessment: { is: { status: { in: ["SCHEDULED", "OPEN", "CLOSED"] } } },
        },
        data: { status: "WITHDRAWN" },
      });
      await tx.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          councilId: scope.councilId,
          action: "LEARNER_ENROLLMENT_ENDED",
          resourceType: "SchoolLearnerEnrollment",
          resourceId: enrollment.id,
          decision: "ALLOW",
          reason: reason.trim(),
          metadata: { registrationId, schoolClassId: enrollment.schoolClassId, learnerId: enrollment.learnerId, learnerNumber: enrollment.learner.learnerNumber, withdrawnAssessmentCandidates: withdrawnCandidates.count },
        },
      });
      return updated;
    }, { isolationLevel: "Serializable" });
  }


  async importLearners(actor: SchoolActor, registrationId: string, classId: string, csv: string, dryRun = true) {
    if (typeof csv !== "string" || !csv.trim()) throw new BadRequestException("Upload a CSV file with learner records.");
    if (Buffer.byteLength(csv, "utf8") > 1024 * 1024) throw new BadRequestException("CSV files must be 1 MB or smaller.");
    const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
    if (rows.length < 2) throw new BadRequestException("The CSV must contain a header and at least one learner row.");
    if (rows.length > 501) throw new BadRequestException("Import up to 500 learners at a time.");
    const headers = rows[0]!.map((header) => header.toLowerCase().replace(/\s+/g, ""));
    const required = ["learnernumber", "givenname", "familyname"];
    for (const header of required) if (!headers.includes(header)) throw new BadRequestException(`Missing required CSV column: ${header}.`);
    const allowed = new Set(["learnernumber", "givenname", "othernames", "familyname", "admissionnumber"]);
    if (headers.some((header) => !allowed.has(header)) || new Set(headers).size !== headers.length) {
      throw new BadRequestException("Use only learnerNumber, givenName, otherNames, familyName and admissionNumber columns; duplicate headers are not allowed.");
    }
    const column = (name: string) => headers.indexOf(name);
    const parsed = rows.slice(1).map((cells, index) => ({
      row: index + 2,
      learnerNumber: (cells[column("learnernumber")] ?? "").trim(),
      givenName: (cells[column("givenname")] ?? "").trim(),
      otherNames: column("othernames") < 0 ? "" : (cells[column("othernames")] ?? "").trim(),
      familyName: (cells[column("familyname")] ?? "").trim(),
      admissionNumber: column("admissionnumber") < 0 ? "" : (cells[column("admissionnumber")] ?? "").trim().toUpperCase(),
    }));
    const issues: { row: number; learnerNumber?: string; message: string }[] = [];
    const seenLearners = new Set<string>(), seenAdmissions = new Set<string>();
    for (const item of parsed) {
      if (headers.length !== (rows[item.row - 1]?.length ?? -1)) issues.push({ row: item.row, message: "Column count does not match the header." });
      if (!item.learnerNumber || item.learnerNumber.length > 80) issues.push({ row: item.row, message: "A learner number (maximum 80 characters) is required." });
      if (!item.givenName || item.givenName.length > 80 || !item.familyName || item.familyName.length > 80 || item.otherNames.length > 120) {
        issues.push({ row: item.row, learnerNumber: item.learnerNumber, message: "Provide given and family names (up to 80 characters each); other names may be up to 120 characters." });
      }
      const learnerKey = item.learnerNumber.toUpperCase();
      if (seenLearners.has(learnerKey)) issues.push({ row: item.row, learnerNumber: item.learnerNumber, message: "Duplicate learner number in this file." });
      seenLearners.add(learnerKey);
      if (item.admissionNumber && seenAdmissions.has(item.admissionNumber)) issues.push({ row: item.row, learnerNumber: item.learnerNumber, message: "Duplicate admission number in this file." });
      if (item.admissionNumber) seenAdmissions.add(item.admissionNumber);
      if (item.admissionNumber.length > 40 || (item.admissionNumber && !/^[A-Z0-9/-]+$/.test(item.admissionNumber))) issues.push({ row: item.row, learnerNumber: item.learnerNumber, message: "Admission number may contain letters, numbers, slash and hyphen only (maximum 40 characters)." });
    }
    if (issues.length) return { dryRun, totalRows: parsed.length, validRows: parsed.length - new Set(issues.map((issue) => issue.row)).size, created: 0, enrolled: 0, issues };
    const operation = async (tx: Prisma.TransactionClient) => {
      const scope = await this.resolveAdminScope(tx, actor, registrationId);
      const schoolClass = await tx.schoolClass.findFirst({
        where: { id: classId, registrationId: scope.registrationId, councilId: scope.councilId, status: "ACTIVE" },
        select: { id: true, grade: true, academicYear: true },
      });
      if (!schoolClass) throw new NotFoundException("The class was not found in this approved school.");
      let created = 0;
      const planned: { item: typeof parsed[number]; learner: { id: string; learnerNumber: string } | null; isNew: boolean }[] = [];
      for (const item of parsed) {
        const learner = await tx.learner.findFirst({ where: { learnerNumber: { equals: item.learnerNumber, mode: "insensitive" } }, select: { id: true, learnerNumber: true, givenName: true, otherNames: true, familyName: true, displayName: true } });
        if (learner) {
          const same = learner.givenName.trim().toLowerCase() === item.givenName.toLowerCase()
            && (learner.otherNames ?? "").trim().toLowerCase() === item.otherNames.toLowerCase()
            && learner.familyName.trim().toLowerCase() === item.familyName.toLowerCase();
          if (!same) { issues.push({ row: item.row, learnerNumber: item.learnerNumber, message: "This system-wide learner number belongs to a different name. Check the source record; identities cannot be overwritten by import." }); continue; }
          const active = await tx.schoolLearnerEnrollment.findFirst({ where: { learnerId: learner.id, status: "ACTIVE", endedAt: null }, select: { registrationId: true } });
          if (active) { issues.push({ row: item.row, learnerNumber: item.learnerNumber, message: active.registrationId === registrationId ? "Already actively enrolled at this school." : "Already actively enrolled at another school; complete the transfer first." }); continue; }
          planned.push({ item, learner, isNew: false });
        } else {
          planned.push({ item, learner: null, isNew: true });
        }
      }
      if (issues.length) return { dryRun, totalRows: parsed.length, validRows: parsed.length - new Set(issues.map((issue) => issue.row)).size, created: 0, enrolled: 0, issues };
      if (dryRun) return { dryRun: true, totalRows: parsed.length, validRows: parsed.length, created: planned.filter((x) => x.isNew).length, enrolled: planned.length, issues: [] };
      for (const entry of planned) {
        const learner = entry.learner ?? await tx.learner.create({ data: {
          learnerNumber: entry.item.learnerNumber, givenName: entry.item.givenName,
          otherNames: entry.item.otherNames || null, familyName: entry.item.familyName,
        }, select: { id: true, learnerNumber: true } });
        if (entry.isNew) created++;
        const enrollment = await tx.schoolLearnerEnrollment.create({ data: {
          learnerId: learner.id, registrationId: scope.registrationId, councilId: scope.councilId,
          schoolClassId: schoolClass.id, admissionNumber: entry.item.admissionNumber || null,
        }, select: { id: true } });
        await tx.auditEvent.create({ data: {
          actorAccountId: actor.accountId, councilId: scope.councilId, action: "LEARNER_ENROLLED",
          resourceType: "SchoolLearnerEnrollment", resourceId: enrollment.id, decision: "ALLOW",
          metadata: { registrationId, schoolClassId: classId, learnerId: learner.id, learnerNumber: learner.learnerNumber, source: "CSV_IMPORT", sourceRow: entry.item.row },
        } });
      }
      return { dryRun: false, totalRows: parsed.length, validRows: parsed.length, created, enrolled: planned.length, issues: [] };
    };
    if (dryRun) return operation(this.prisma.client);
    try {
      return await this.prisma.client.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (prismaCode(error) === "P2002" || prismaCode(error) === "P2034") throw new ConflictException("The import conflicted with another enrollment or admission number change. Nothing was imported; refresh and validate again.");
      throw error;
    }
  }

  async enroll(actor: SchoolActor, registrationId: string, classId: string, input: EnrollLearnerDto) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const scope = await this.resolveAdminScope(tx, actor, registrationId);
        const schoolClass = await tx.schoolClass.findFirst({
          where: { id: classId, registrationId: scope.registrationId, councilId: scope.councilId, status: "ACTIVE" },
          select: { id: true, grade: true, academicYear: true },
        });
        if (!schoolClass) throw new NotFoundException("The class was not found in this approved school.");

        if (Boolean(input.learnerId) === Boolean(input.givenName || input.familyName)) {
          throw new BadRequestException("Provide either an existing learner ID or the learner's name to create a new identity.");
        }
        let learner;
        if (input.learnerId) {
          learner = await tx.learner.findUnique({
            where: { id: input.learnerId },
            select: { id: true, learnerNumber: true, givenName: true, otherNames: true, familyName: true, displayName: true },
          });
          if (!learner) throw new NotFoundException("The existing learner identity was not found.");
        } else {
          const givenName = input.givenName?.trim() ?? "";
          const familyName = input.familyName?.trim() ?? "";
          if (!givenName || !familyName) throw new BadRequestException("Learner given name and family name are required.");
          learner = await tx.learner.create({
            data: {
              learnerNumber: `LRN-${randomUUID().replaceAll("-", "").toUpperCase()}`,
              givenName,
              familyName,
              otherNames: input.otherNames?.trim() || null,
            },
            select: { id: true, learnerNumber: true, givenName: true, otherNames: true, familyName: true, displayName: true },
          });
        }

        const activeEnrollment = await tx.schoolLearnerEnrollment.findFirst({
          where: { learnerId: learner.id, status: "ACTIVE", endedAt: null },
          select: { id: true, registrationId: true },
        });
        if (activeEnrollment) {
          throw new ConflictException(activeEnrollment.registrationId === registrationId
            ? "This learner is already actively enrolled at this school. Move the existing enrollment instead of creating a duplicate."
            : "This learner has an active enrollment at another school. End that enrollment before transferring the learner.");
        }

        const enrollment = await tx.schoolLearnerEnrollment.create({
          data: {
            learnerId: learner.id,
            registrationId: scope.registrationId,
            councilId: scope.councilId,
            schoolClassId: schoolClass.id,
            admissionNumber: input.admissionNumber?.trim().toUpperCase() || null,
          },
          select: { id: true, admissionNumber: true, enrolledAt: true, status: true },
        });
        await tx.auditEvent.create({
          data: {
            actorAccountId: actor.accountId,
            councilId: scope.councilId,
            action: "LEARNER_ENROLLED",
            resourceType: "SchoolLearnerEnrollment",
            resourceId: enrollment.id,
            decision: "ALLOW",
            metadata: { registrationId, schoolClassId: classId, learnerId: learner.id, learnerNumber: learner.learnerNumber },
          },
        });
        return {
          ...enrollment,
          learner: { id: learner.id, learnerNumber: learner.learnerNumber, name: displayName(learner) },
        };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (prismaCode(error) === "P2002" || prismaCode(error) === "P2034") {
        throw new ConflictException("The learner is already enrolled or the admission number is already in use. Refresh and try again.");
      }
      throw error;
    }
  }
}
