import { Injectable, ServiceUnavailableException } from "@nestjs/common";

export interface VerificationEmailResult {
  previewUrl?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

@Injectable()
export class EmailService {
  async sendVerificationEmail(
    email: string,
    givenName: string,
    token: string,
  ): Promise<VerificationEmailResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    const configuredWebUrl = process.env.WEB_APP_URL?.trim();
    const isDevelopment = process.env.NODE_ENV !== "production";

    if (!apiKey || !from || !configuredWebUrl) {
      if (isDevelopment && process.env.DEV_EMAIL_PREVIEW === "true") {
        return { previewUrl: this.createVerificationUrl(configuredWebUrl || "http://localhost:3000", token) };
      }
      throw new ServiceUnavailableException(
        "Email delivery is temporarily unavailable.",
      );
    }

    let verificationUrl: string;
    try {
      verificationUrl = this.createVerificationUrl(configuredWebUrl, token);
      if (!isDevelopment && new URL(configuredWebUrl).protocol !== "https:") {
        throw new Error("Production email links must use HTTPS.");
      }
    } catch {
      throw new ServiceUnavailableException(
        "Email delivery is temporarily unavailable.",
      );
    }

    const safeName = escapeHtml(givenName);
    const text = [
      `Hello ${givenName},`,
      "",
      "Verify your email address to activate your Sentinel account:",
      verificationUrl,
      "",
      "This link expires in 24 hours. If you did not request this account, you can ignore this email.",
    ].join("\n");
    const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172b4d"><main style="max-width:560px;margin:40px auto;padding:36px;background:#fff;border:1px solid #e2e8f0;border-radius:18px"><p style="font-size:12px;font-weight:700;letter-spacing:2px;color:#2457c5">SENTINEL</p><h1 style="font-size:24px">Verify your email</h1><p>Hello ${safeName},</p><p>Confirm this email address to activate your Sentinel account and continue with school registration.</p><p style="margin:28px 0"><a href="${verificationUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#2457c5;color:#fff;text-decoration:none;font-weight:700">Verify email address</a></p><p style="font-size:13px;color:#64748b">This link expires in 24 hours. If you did not request this account, you can ignore this email.</p><p style="font-size:12px;color:#94a3b8;word-break:break-all">${verificationUrl}</p></main></body></html>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Verify your Sentinel account",
          text,
          html,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new Error("Resend rejected the verification email.");
      }
    } catch {
      throw new ServiceUnavailableException(
        "Email delivery is temporarily unavailable.",
      );
    }

    return {};
  }

  async sendPasswordResetEmail(
    email: string,
    givenName: string,
    token: string,
  ): Promise<VerificationEmailResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    const configuredWebUrl = process.env.WEB_APP_URL?.trim();
    const isDevelopment = process.env.NODE_ENV !== "production";

    if (!apiKey || !from || !configuredWebUrl) {
      if (isDevelopment && process.env.DEV_EMAIL_PREVIEW === "true") {
        return { previewUrl: this.createPasswordResetUrl(configuredWebUrl || "http://localhost:3000", token) };
      }
      throw new ServiceUnavailableException("Email delivery is temporarily unavailable.");
    }

    let resetUrl: string;
    try {
      resetUrl = this.createPasswordResetUrl(configuredWebUrl, token);
      if (!isDevelopment && new URL(configuredWebUrl).protocol !== "https:") {
        throw new Error("Production password reset links must use HTTPS.");
      }
    } catch {
      throw new ServiceUnavailableException("Email delivery is temporarily unavailable.");
    }

    const safeName = escapeHtml(givenName);
    const text = [
      `Hello ${givenName},`,
      "",
      "A password reset was requested for your Sentinel account.",
      "Use this one-time link to choose a new password:",
      resetUrl,
      "",
      "This link expires in 30 minutes. If you did not request a reset, you can ignore this email; your current password will remain unchanged.",
    ].join("\n");
    const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172b4d"><main style="max-width:560px;margin:40px auto;padding:36px;background:#fff;border:1px solid #e2e8f0;border-radius:18px"><p style="font-size:12px;font-weight:700;letter-spacing:2px;color:#2457c5">SENTINEL</p><h1 style="font-size:24px">Reset your password</h1><p>Hello ${safeName},</p><p>A password reset was requested for your Sentinel account. Use this one-time link to choose a new password.</p><p style="margin:28px 0"><a href="${resetUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#2457c5;color:#fff;text-decoration:none;font-weight:700">Choose a new password</a></p><p style="font-size:13px;color:#64748b">This link expires in 30 minutes. If you did not request a reset, ignore this email; your current password remains unchanged.</p><p style="font-size:12px;color:#94a3b8;word-break:break-all">${resetUrl}</p></main></body></html>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Reset your Sentinel password",
          text,
          html,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("Resend rejected the password reset email.");
    } catch {
      throw new ServiceUnavailableException("Email delivery is temporarily unavailable.");
    }

    return {};
  }

  async sendTeacherInvitationEmail(input: {
    to: string;
    teacherName: string;
    schoolName: string;
    councilName: string;
    token: string;
  }): Promise<VerificationEmailResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    const configuredWebUrl = process.env.WEB_APP_URL?.trim();
    const isDevelopment = process.env.NODE_ENV !== "production";
    if (!apiKey || !from || !configuredWebUrl) {
      if (isDevelopment && process.env.DEV_EMAIL_PREVIEW === "true") {
        return { previewUrl: this.createTeacherInvitationUrl(configuredWebUrl || "http://localhost:3000", input.token) };
      }
      throw new ServiceUnavailableException("Email delivery is temporarily unavailable.");
    }

    let invitationUrl: string;
    try {
      invitationUrl = this.createTeacherInvitationUrl(configuredWebUrl, input.token);
      if (!isDevelopment && new URL(configuredWebUrl).protocol !== "https:") {
        throw new Error("Production invitation links must use HTTPS.");
      }
    } catch {
      throw new ServiceUnavailableException("Email delivery is temporarily unavailable.");
    }

    const safeName = escapeHtml(input.teacherName);
    const safeSchool = escapeHtml(input.schoolName);
    const safeCouncil = escapeHtml(input.councilName);
    const text = [
      `Hello ${input.teacherName},`,
      "",
      `A School Administrator invited you to join ${input.schoolName} under ${input.councilName} as a Teacher in Sentinel.`,
      "",
      "Accept the invitation and set your password using this one-time link:",
      invitationUrl,
      "",
      "The invitation expires in 7 days. If you do not recognize this school, ignore this email and contact the school administration.",
    ].join("\\n");
    const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172b4d"><main style="max-width:560px;margin:40px auto;padding:36px;background:#fff;border:1px solid #e2e8f0;border-radius:18px"><p style="font-size:12px;font-weight:700;letter-spacing:2px;color:#2457c5">SENTINEL</p><h1 style="font-size:24px">Teacher invitation</h1><p>Hello ${safeName},</p><p>A School Administrator invited you to join <strong>${safeSchool}</strong> under ${safeCouncil} as a Teacher in Sentinel.</p><p style="margin:28px 0"><a href="${invitationUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#2457c5;color:#fff;text-decoration:none;font-weight:700">Accept invitation</a></p><p style="font-size:13px;color:#64748b">The invitation expires in 7 days. If you do not recognize this school, ignore this email and contact the school administration.</p><p style="font-size:12px;color:#94a3b8;word-break:break-all">${invitationUrl}</p></main></body></html>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: `Invitation to teach at ${input.schoolName} on Sentinel`,
          text,
          html,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("Resend rejected the teacher invitation email.");
    } catch {
      throw new ServiceUnavailableException("Email delivery is temporarily unavailable.");
    }

    return {};
  }

  async sendSchoolRegistrationDecisionEmail(
    email: string,
    givenName: string,
    schoolName: string,
    councilName: string,
    decision: "APPROVED" | "REJECTED",
    reason: string,
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    const configuredWebUrl = process.env.WEB_APP_URL?.trim();
    if (!apiKey || !from || !configuredWebUrl) {
      throw new ServiceUnavailableException(
        "Email delivery is temporarily unavailable.",
      );
    }

    let registrationUrl: string;
    try {
      registrationUrl = new URL("/school-registration", configuredWebUrl).toString();
      if (
        process.env.NODE_ENV === "production" &&
        new URL(configuredWebUrl).protocol !== "https:"
      ) {
        throw new Error("Production email links must use HTTPS.");
      }
    } catch {
      throw new ServiceUnavailableException(
        "Email delivery is temporarily unavailable.",
      );
    }

    const approved = decision === "APPROVED";
    const outcome = approved ? "approved" : "not approved";
    const safeName = escapeHtml(givenName);
    const safeSchoolName = escapeHtml(schoolName);
    const safeCouncilName = escapeHtml(councilName);
    const safeReason = escapeHtml(reason);
    const subject = approved
      ? "Your Sentinel school registration was approved"
      : "An update on your Sentinel school registration";
    const text = [
      `Hello ${givenName},`,
      "",
      `Your school registration for ${schoolName} under ${councilName} was ${outcome}.`,
      "",
      `Review feedback: ${reason}`,
      "",
      `View your registration: ${registrationUrl}`,
      "",
      approved
        ? "Your School Administrator access is now active. Sign in to continue."
        : "You can review the decision and feedback in your registration history.",
    ].join("\n");
    const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172b4d"><main style="max-width:560px;margin:40px auto;padding:36px;background:#fff;border:1px solid #e2e8f0;border-radius:18px"><p style="font-size:12px;font-weight:700;letter-spacing:2px;color:#2457c5">SENTINEL</p><h1 style="font-size:24px">School registration ${approved ? "approved" : "decision"}</h1><p>Hello ${safeName},</p><p>Your school registration for <strong>${safeSchoolName}</strong> under ${safeCouncilName} was ${outcome}.</p><div style="margin:24px 0;padding:16px;background:#f5f7fb;border-radius:10px"><p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b">REVIEW FEEDBACK</p><p style="margin:0;line-height:1.6">${safeReason}</p></div><p style="margin:28px 0"><a href="${registrationUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#2457c5;color:#fff;text-decoration:none;font-weight:700">View registration status</a></p><p style="font-size:13px;color:#64748b">${approved ? "Your School Administrator access is now active. Sign in to continue." : "You can review the decision and feedback in your registration history."}</p></main></body></html>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [email], subject, text, html }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("Resend rejected the notification.");
    } catch {
      throw new ServiceUnavailableException(
        "Email delivery is temporarily unavailable.",
      );
    }
  }

  async sendSchoolMembershipAddedEmail(input: {
    to: string;
    teacherName: string;
    schoolName: string;
    councilName: string;
    action: "LINKED" | "REACTIVATED";
  }): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    const configuredWebUrl = process.env.WEB_APP_URL?.trim();
    if (!apiKey || !from || !configuredWebUrl) {
      throw new ServiceUnavailableException(
        "Email delivery is temporarily unavailable.",
      );
    }

    let workspaceUrl: string;
    try {
      workspaceUrl = new URL("/workspace", configuredWebUrl).toString();
      if (
        process.env.NODE_ENV === "production" &&
        new URL(configuredWebUrl).protocol !== "https:"
      ) {
        throw new Error("Production email links must use HTTPS.");
      }
    } catch {
      throw new ServiceUnavailableException(
        "Email delivery is temporarily unavailable.",
      );
    }

    const safeName = escapeHtml(input.teacherName);
    const safeSchool = escapeHtml(input.schoolName);
    const safeCouncil = escapeHtml(input.councilName);
    const actionText = input.action === "REACTIVATED" ? "restored" : "added";
    const subject = input.action === "REACTIVATED"
      ? "Your Teacher access in Sentinel has been restored"
      : "You've been added as a Teacher in Sentinel";
    const text = [
      `Hello ${input.teacherName},`,
      "",
      `A School Administrator ${actionText} your Teacher access at ${input.schoolName} under ${input.councilName}.`,
      "",
      `Sign in to Sentinel to view your school workspace: ${workspaceUrl}`,
      "",
      "If you do not recognize this school, contact the school administration before using the account.",
    ].join("\n");
    const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172b4d"><main style="max-width:560px;margin:40px auto;padding:36px;background:#fff;border:1px solid #e2e8f0;border-radius:18px"><p style="font-size:12px;font-weight:700;letter-spacing:2px;color:#2457c5">SENTINEL</p><h1 style="font-size:24px">Teacher access ${actionText}</h1><p>Hello ${safeName},</p><p>A School Administrator ${actionText} your <strong>Teacher</strong> access at <strong>${safeSchool}</strong> under ${safeCouncil}.</p><p style="margin:28px 0"><a href="${workspaceUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#2457c5;color:#fff;text-decoration:none;font-weight:700">Open Sentinel workspace</a></p><p style="font-size:13px;color:#64748b">If you do not recognize this school, contact the school administration before using the account.</p></main></body></html>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject,
          text,
          html,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("Resend rejected the school membership email.");
    } catch {
      throw new ServiceUnavailableException(
        "Email delivery is temporarily unavailable.",
      );
    }
  }

  private createTeacherInvitationUrl(baseUrl: string, token: string): string {
    const url = new URL("/accept-teacher-invitation", baseUrl);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private createPasswordResetUrl(baseUrl: string, token: string): string {
    const url = new URL("/reset-password", baseUrl);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private createVerificationUrl(baseUrl: string, token: string): string {
    const url = new URL("/verify-email", baseUrl);
    url.searchParams.set("token", token);
    return url.toString();
  }
}
