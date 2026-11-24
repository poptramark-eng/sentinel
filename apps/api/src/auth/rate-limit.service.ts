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
    } catch (error) {
      this.initializationError = error;
    }
  }

  async checkLogin(ipAddress: string, email?: string): Promise<RateLimitDecision> {
    this.ensureConfigured();
    if (!this.loginIpLimiter || !this.loginEmailLimiter) {
      return { allowed: true };
    }

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const checks = [this.loginIpLimiter.limit(this.normalizeIp(ipAddress))];
    if (normalizedEmail) {
      const emailKey = createHmac(
        "sha256",
        process.env.REFRESH_TOKEN_PEPPER ?? "sentinel-development-only",
      )
        .update(normalizedEmail)
        .digest("hex");
      checks.push(this.loginEmailLimiter.limit(emailKey));
    }

    try {
      return this.evaluate(await Promise.all(checks));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable.",
      );
    }
  }

  async checkRefresh(ipAddress: string): Promise<RateLimitDecision> {
    this.ensureConfigured();
    if (!this.refreshIpLimiter) return { allowed: true };
    try {
      return this.evaluate([
        await this.refreshIpLimiter.limit(this.normalizeIp(ipAddress)),
      ]);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable.",
      );
    }
  }

  private ensureConfigured(): void {
    if (
      !this.loginIpLimiter ||
      !this.loginEmailLimiter ||
      !this.refreshIpLimiter
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
