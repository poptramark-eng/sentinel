import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import { Prisma } from "@cbe/database";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { PrismaService } from "../database/prisma.service";

export interface RateLimitDecision {
  allowed: boolean;
  resetAt?: number;
}

interface DatabaseRateLimitCheck {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  keyHash?: string;
}

class BoundedEphemeralCache extends Map<string, number> {
  constructor(private readonly maxEntries = 5_000) {
    super();
  }

  override set(key: string, value: number): this {
    if (this.has(key)) this.delete(key);
    super.set(key, value);
    if (this.size > this.maxEntries) {
      const oldest = this.keys().next().value;
      if (oldest !== undefined) this.delete(oldest);
    }
    return this;
  }
}

@Injectable()
export class RateLimitService {
  private readonly upstashConfigured: boolean;
  private readonly loginIpLimiter?: Ratelimit;
  private readonly loginEmailLimiter?: Ratelimit;
  private readonly refreshIpLimiter?: Ratelimit;
  private readonly registerIpLimiter?: Ratelimit;
  private readonly registerEmailLimiter?: Ratelimit;
  private readonly verifyEmailIpLimiter?: Ratelimit;
  private readonly resendIpLimiter?: Ratelimit;
  private readonly resendEmailLimiter?: Ratelimit;
  private readonly initializationError?: unknown;

  constructor(@Optional() private readonly prisma?: PrismaService) {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    this.upstashConfigured = Boolean(url || token);

    if (!this.upstashConfigured) return;
    if (!url || !token) {
      this.initializationError = new Error(
        "Both Upstash REST URL and token are required.",
      );
      return;
    }

    try {
      const redis = new Redis({ url, token });
      const namespace = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
      const shared = {
        redis,
        analytics: false,
        timeout: 1_000,
        ephemeralCache: new BoundedEphemeralCache(),
      };

      this.loginIpLimiter = new Ratelimit({
        ...shared,
        limiter: Ratelimit.slidingWindow(30, "15 m"),
        prefix: `sentinel:${namespace}:auth:login:ip`,
      });
      this.loginEmailLimiter = new Ratelimit({
        ...shared,
        limiter: Ratelimit.slidingWindow(5, "15 m"),
        prefix: `sentinel:${namespace}:auth:login:email`,
      });
      this.refreshIpLimiter = new Ratelimit({
        ...shared,
        limiter: Ratelimit.slidingWindow(60, "5 m"),
        prefix: `sentinel:${namespace}:auth:refresh:ip`,
      });
      this.registerIpLimiter = new Ratelimit({
        ...shared,
        limiter: Ratelimit.slidingWindow(5, "1 h"),
        prefix: `sentinel:${namespace}:auth:register:ip`,
      });
      this.registerEmailLimiter = new Ratelimit({
        ...shared,
        limiter: Ratelimit.slidingWindow(3, "1 h"),
        prefix: `sentinel:${namespace}:auth:register:email`,
      });
      this.verifyEmailIpLimiter = new Ratelimit({
        ...shared,
        limiter: Ratelimit.slidingWindow(20, "15 m"),
        prefix: `sentinel:${namespace}:auth:verify-email:ip`,
      });
      this.resendIpLimiter = new Ratelimit({
        ...shared,
        limiter: Ratelimit.slidingWindow(5, "1 h"),
        prefix: `sentinel:${namespace}:auth:resend-verification:ip`,
      });
      this.resendEmailLimiter = new Ratelimit({
        ...shared,
        limiter: Ratelimit.slidingWindow(3, "1 h"),
        prefix: `sentinel:${namespace}:auth:resend-verification:email`,
      });
    } catch (error) {
      this.initializationError = error;
    }
  }

  async checkLogin(ipAddress: string, email?: string): Promise<RateLimitDecision> {
    return this.checkEmailAndIp(
      ipAddress,
      email,
      this.loginIpLimiter,
      this.loginEmailLimiter,
      "login",
    );
  }

  async checkRegister(ipAddress: string, email?: string): Promise<RateLimitDecision> {
    return this.checkEmailAndIp(
      ipAddress,
      email,
      this.registerIpLimiter,
      this.registerEmailLimiter,
      "register",
    );
  }

  async checkResendVerification(
    ipAddress: string,
    email?: string,
  ): Promise<RateLimitDecision> {
    return this.checkEmailAndIp(
      ipAddress,
      email,
      this.resendIpLimiter,
      this.resendEmailLimiter,
      "resend-verification",
    );
  }

  async checkVerifyEmail(ipAddress: string): Promise<RateLimitDecision> {
    if (this.upstashConfigured) {
      this.ensureUpstashConfigured();
      return this.runChecks([
        this.verifyEmailIpLimiter!.limit(this.normalizeIp(ipAddress)),
      ]);
    }

    return this.checkDatabase([
      {
        scope: "auth:verify-email:ip",
        identifier: this.normalizeIp(ipAddress),
        limit: 20,
        windowMs: 15 * 60 * 1_000,
      },
    ]);
  }

  async checkRefresh(ipAddress: string): Promise<RateLimitDecision> {
    if (this.upstashConfigured) {
      this.ensureUpstashConfigured();
      return this.runChecks([
        this.refreshIpLimiter!.limit(this.normalizeIp(ipAddress)),
      ]);
    }

    return this.checkDatabase([
      {
        scope: "auth:refresh:ip",
        identifier: this.normalizeIp(ipAddress),
        limit: 60,
        windowMs: 5 * 60 * 1_000,
      },
    ]);
  }

  private async checkEmailAndIp(
    ipAddress: string,
    email: string | undefined,
    ipLimiter: Ratelimit | undefined,
    emailLimiter: Ratelimit | undefined,
    policy: "login" | "register" | "resend-verification",
  ): Promise<RateLimitDecision> {
    const normalizedIp = this.normalizeIp(ipAddress);
    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    if (this.upstashConfigured) {
      this.ensureUpstashConfigured();
      const checks = [ipLimiter!.limit(normalizedIp)];
      if (normalizedEmail) {
        const emailKey = this.hashIdentifier(
          `auth:${policy}:email`,
          normalizedEmail,
        );
        checks.push(emailLimiter!.limit(emailKey));
      }
      return this.runChecks(checks);
    }

    const limits =
      policy === "login"
        ? { ip: 30, email: 5, windowMs: 15 * 60 * 1_000 }
        : policy === "register"
          ? { ip: 5, email: 3, windowMs: 60 * 60 * 1_000 }
          : { ip: 5, email: 3, windowMs: 60 * 60 * 1_000 };

    const checks: DatabaseRateLimitCheck[] = [
      {
        scope: `auth:${policy}:ip`,
        identifier: normalizedIp,
        limit: limits.ip,
        windowMs: limits.windowMs,
      },
    ];
    if (normalizedEmail) {
      checks.push({
        scope: `auth:${policy}:email`,
        identifier: normalizedEmail,
        limit: limits.email,
        windowMs: limits.windowMs,
      });
    }
    return this.checkDatabase(checks);
  }

  private async checkDatabase(
    checks: DatabaseRateLimitCheck[],
  ): Promise<RateLimitDecision> {
    if (!this.prisma) {
      if (process.env.NODE_ENV === "production") {
        console.error("[RateLimitService] PrismaService was not injected.");
        this.ensurePepper();
        throw new ServiceUnavailableException(
          "Authentication protection is temporarily unavailable.",
        );
      }
      return { allowed: true };
    }

    this.ensurePepper();
    const keyedChecks = checks.map((check) => ({
      ...check,
      keyHash: this.hashIdentifier(check.scope, check.identifier),
    }));
    const now = new Date();

    try {
      return await this.prisma.client.$transaction(
        async (tx) => {
          const lockKeys = [...new Set(keyedChecks.map((check) => check.keyHash))].sort();
          for (const keyHash of lockKeys) {
            await tx.$queryRaw(
              Prisma.sql`WITH advisory_lock AS MATERIALIZED (
                SELECT pg_advisory_xact_lock(hashtextextended(${keyHash}, 0))
              )
              SELECT 1::int AS locked FROM advisory_lock`,
            );
          }

          await tx.$executeRaw(
            Prisma.sql`DELETE FROM "AuthRateLimitEvent" WHERE "expiresAt" <= ${now}`,
          );

          const blockedUntil: number[] = [];
          for (const check of keyedChecks) {
            const windowStart = new Date(now.getTime() - check.windowMs);
            const rows = await tx.$queryRaw<
              Array<{ count: number; oldest: Date | null }>
            >(
              Prisma.sql`SELECT COUNT(*)::int AS "count", MIN("createdAt") AS "oldest"
                FROM "AuthRateLimitEvent"
                WHERE "keyHash" = ${check.keyHash}
                  AND "createdAt" >= ${windowStart}`,
            );
            const count = Number(rows[0]?.count ?? 0);
            if (count >= check.limit) {
              const oldest = rows[0]?.oldest ?? now;
              blockedUntil.push(oldest.getTime() + check.windowMs);
            }
          }

          if (blockedUntil.length > 0) {
            return {
              allowed: false,
              resetAt: Math.max(...blockedUntil),
            };
          }

          for (const check of keyedChecks) {
            const expiresAt = new Date(now.getTime() + check.windowMs);
            await tx.$executeRaw(
              Prisma.sql`INSERT INTO "AuthRateLimitEvent" ("id", "keyHash", "createdAt", "expiresAt")
                VALUES (gen_random_uuid(), ${check.keyHash}, ${now}, ${expiresAt})`,
            );
          }

          return { allowed: true };
        },
        { maxWait: 1_000, timeout: 2_500 },
      );
    } catch (error) {
      console.error("[RateLimitService] PostgreSQL rate-limit operation failed.", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
        code:
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: unknown }).code)
            : undefined,
      });
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable.",
      );
    }
  }

  private ensureUpstashConfigured(): void {
    this.ensurePepper();
    if (
      this.initializationError ||
      !this.loginIpLimiter ||
      !this.loginEmailLimiter ||
      !this.refreshIpLimiter ||
      !this.registerIpLimiter ||
      !this.registerEmailLimiter ||
      !this.verifyEmailIpLimiter ||
      !this.resendIpLimiter ||
      !this.resendEmailLimiter
    ) {
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable.",
      );
    }
  }

  private ensurePepper(): void {
    const pepper = process.env.REFRESH_TOKEN_PEPPER;
    if (!pepper || Buffer.byteLength(pepper) < 32) {
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable.",
      );
    }
  }

  private hashIdentifier(scope: string, identifier: string): string {
    const pepper = process.env.REFRESH_TOKEN_PEPPER;
    if (!pepper) {
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable.",
      );
    }
    return createHmac("sha256", pepper)
      .update(`sentinel:${process.env.APP_ENV ?? process.env.NODE_ENV ?? "development"}:${scope}:${identifier}`)
      .digest("hex");
  }

  private async runChecks(
    checks: Array<Promise<{ success: boolean; reset: number; reason?: string }>>,
  ): Promise<RateLimitDecision> {
    try {
      return this.evaluate(await Promise.all(checks));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable.",
      );
    }
  }

  private evaluate(
    results: Array<{ success: boolean; reset: number; reason?: string }>,
  ): RateLimitDecision {
    if (results.some((result) => result.reason === "timeout")) {
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable.",
      );
    }

    const blocked = results.filter((result) => !result.success);
    if (blocked.length === 0) return { allowed: true };

    return {
      allowed: false,
      resetAt: Math.max(...blocked.map((result) => result.reset)),
    };
  }

  private normalizeIp(ipAddress: string): string {
    return ipAddress.trim().slice(0, 128) || "unknown";
  }
}
