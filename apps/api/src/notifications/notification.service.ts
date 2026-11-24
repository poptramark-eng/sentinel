import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c] ?? c);
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  constructor(private readonly prisma: PrismaService) {}

  async processPendingForAssessment(assessmentId: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) {
      this.logger.warn("Assessment notifications remain queued because Resend is not configured.");
      return;
    }
    const pending = await this.prisma.client.notificationDelivery.findMany({
      where: { assessmentId, status: "QUEUED", nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" }, take: 100,
    });
    for (const item of pending) {
      const claim = await this.prisma.client.notificationDelivery.updateMany({
        where: { id: item.id, status: "QUEUED" },
        data: { status: "PROCESSING", attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
      });
      if (claim.count !== 1) continue;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [item.recipientEmail], subject: item.subject, text: item.textBody, html: item.htmlBody }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}.`);
        const result = await response.json() as { id?: string };
        await this.prisma.client.$transaction(async (tx) => {
          await tx.notificationDelivery.update({ where: { id: item.id }, data: {
            status: "SENT", providerMessageId: result.id ?? null, sentAt: new Date(), lastError: null,
          }});
          await tx.auditEvent.create({ data: {
            councilId: item.councilId, action: "NOTIFICATION_SENT",
            resourceType: "NotificationDelivery", resourceId: item.id, decision: "ALLOW",
            metadata: { provider: "RESEND", providerMessageId: result.id ?? null, template: item.template },
          }});
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown delivery failure.";
        await this.prisma.client.$transaction(async (tx) => {
          await tx.notificationDelivery.update({ where: { id: item.id }, data: {
            status: "FAILED", lastError: message.slice(0, 500),
          }});
          await tx.auditEvent.create({ data: {
            councilId: item.councilId, action: "NOTIFICATION_FAILED",
            resourceType: "NotificationDelivery", resourceId: item.id,
            reason: "Provider delivery failed.",
            metadata: {
              provider: "RESEND",
              template: item.template,
              recipientAccountId: item.recipientAccountId,
              attemptCount: item.attemptCount + 1,
              error: message.slice(0, 500),
            },
          }});
        });
        this.logger.warn(`Assessment notification ${item.id} failed; scheduling remains committed.`);
      }
    }
  }

  static scheduledAssessmentContent(input: {
    recipientName: string;
    assessmentName: string;
    assessmentCode: string;
    grade: string;
    academicYear: number;
    opensAt: Date;
    closesAt: Date;
  }) {
    const formatKenyaTime = (value: Date) => new Intl.DateTimeFormat("en-KE", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi",
    }).format(value);
    const opensAt = formatKenyaTime(input.opensAt);
    const closesAt = formatKenyaTime(input.closesAt);
    const grade = input.grade.replaceAll("_", " ");
    const subject = `Assessment scheduled: ${input.assessmentName}`;
    const textBody = [
      `Hello ${input.recipientName},`, "",
      "A new assessment has been scheduled for your Council.",
      `Assessment: ${input.assessmentName} (${input.assessmentCode})`,
      `Grade: ${grade}`,
      `Academic year: ${input.academicYear}`,
      `Opens: ${opensAt}`,
      `Closes: ${closesAt}`, "",
      "Sign in to Sentinel to review the assessment and coordinate your school's participation.",
    ].join("\n");
    const htmlBody = [
      '<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172b4d">',
      '<main style="max-width:560px;margin:40px auto;padding:36px;background:#fff;border:1px solid #e2e8f0;border-radius:18px">',
      '<p style="font-size:12px;font-weight:700;letter-spacing:2px;color:#2457c5">SENTINEL</p>',
      '<h1>Assessment scheduled</h1>',
      '<p>Hello ' + escapeHtml(input.recipientName) + ',</p>',
      '<p>A new assessment has been scheduled for your Council.</p>',
      '<p><strong>' + escapeHtml(input.assessmentName) + '</strong> (' + escapeHtml(input.assessmentCode) + ')</p>',
      '<p>Grade: ' + escapeHtml(grade) + ' · Academic year: ' + input.academicYear + '</p>',
      '<p>Opens: ' + escapeHtml(opensAt) + '<br>Closes: ' + escapeHtml(closesAt) + '</p>',
      '<p>Sign in to Sentinel to review the assessment and coordinate your school\\'s participation.</p>',
      '</main></body></html>',
    ].join("");
    return { subject, textBody, htmlBody };
  }
}
