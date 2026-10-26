/** JWT claims are only expiry hints. Server verification remains authoritative. */
export function tokenExpiry(token: string): number | null {
  try {
    if (token.length > 16_384 || token.split(".").length !== 3) return null;
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"),
    );
    return typeof claims.exp === "number" &&
      Number.isFinite(claims.exp) &&
      claims.exp > 0 &&
      claims.exp * 1000 <= 8_640_000_000_000_000
      ? claims.exp * 1000
      : null;
  } catch {
    return null;
  }
}
export function validTokenInput(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 20 &&
    value.length <= 16_384 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  );
}
