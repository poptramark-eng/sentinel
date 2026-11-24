import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitDecision {
  allowed: boolean;
  resetAt?: number;
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
  private readonly loginIpLimiter?: Ratelimit;
  private readonly loginEmailLimiter?: Ratelimit;
  private readonly refreshIpLimiter?: Ratelimit;
  private readonly registerIpLimiter?: Ratelimit;
  private readonly registerEmailLimiter?: Ratelimit;
  private readonly verifyEmailIpLimiter?: Ratelimit;
  private readonly resendIpLimiter?: Ratelimit;
  private readonly resendEmailLimiter?: Ratelimit;
  private readonly initializationError?: unknown;

  constructor() {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

    if (!url || !token) return;

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
    );
  }

  async checkRegister(ipAddress: string, email?: string): Promise<RateLimitDecision> {
    return this.checkEmailAndIp(
      ipAddress,
      email,
      this.registerIpLimiter,
      this.registerEmailLimiter,
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
    );
  }

  async checkVerifyEmail(ipAddress: string): Promise<RateLimitDecision> {
    this.ensureConfigured();
    if (!this.verifyEmailIpLimiter) return { allowed: true };
    return this.runChecks([
      this.verifyEmailIpLimiter.limit(this.normalizeIp(ipAddress)),
    ]);
  }

  async checkRefresh(ipAddress: string): Promise<RateLimitDecision> {
    this.ensureConfigured();
    if (!this.refreshIpLimiter) return { allowed: true };
    return this.runChecks([
      this.refreshIpLimiter.limit(this.normalizeIp(ipAddress)),
    ]);
  }

  private async checkEmailAndIp(
    ipAddress: string,
    email: string | undefined,
    ipLimiter: Ratelimit | undefined,
    emailLimiter: Ratelimit | undefined,
  ): Promise<RateLimitDecision> {
    this.ensureConfigured();
    if (!ipLimiter || !emailLimiter) return { allowed: true };

    const checks = [ipLimiter.limit(this.normalizeIp(ipAddress))];
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (normalizedEmail) {
      const emailKey = createHmac(
        "sha256",
        process.env.REFRESH_TOKEN_PEPPER ?? "sentinel-development-only",
      )
        .update(normalizedEmail)
        .digest("hex");
      checks.push(emailLimiter.limit(emailKey));
    }
    return this.runChecks(checks);
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

  private ensureConfigured(): void {
    const pepper = process.env.REFRESH_TOKEN_PEPPER;
    if (
      process.env.NODE_ENV === "production" &&
      (!pepper || Buffer.byteLength(pepper) < 32)
    ) {
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable.",
      );
    }

    if (
      !this.loginIpLimiter ||
      !this.loginEmailLimiter ||
      !this.refreshIpLimiter ||
      !this.registerIpLimiter ||
      !this.registerEmailLimiter ||
      !this.verifyEmailIpLimiter ||
      !this.resendIpLimiter ||
      !this.resendEmailLimiter
    ) {
      if (process.env.NODE_ENV === "production") {
        throw new ServiceUnavailableException(
          "Authentication protection is temporarily unavailable.",
        );
      }
      return;
    }

    if (this.initializationError) {
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
