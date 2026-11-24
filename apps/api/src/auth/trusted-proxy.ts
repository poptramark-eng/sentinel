/**
 * Resolve Fastify's trustProxy option without treating "true" as wildcard trust.
 * Only explicit proxy IP addresses or CIDR ranges are accepted.
 */
export function resolveTrustedProxies(
  configured: string | undefined,
): boolean | string[] {
  const value = configured?.trim();
  if (!value || value.toLowerCase() === "false") return false;

  if (value.toLowerCase() === "true" || value === "*") {
    throw new Error(
      "TRUST_PROXY must be false or explicit trusted proxy IP/CIDR values; wildcard trust is not allowed.",
    );
  }

  const proxies = value.split(",").map((entry) => entry.trim());
  if (proxies.some((entry) => !entry || entry === "*")) {
    throw new Error(
      "TRUST_PROXY must contain only explicit IP addresses or CIDR ranges.",
    );
  }
  return proxies;
}
