export function redact(text: string, secrets: string[] = []): string {
  let safe = text;
  for (const secret of secrets)
    if (secret) safe = safe.split(secret).join("[REDACTED]");
  return safe
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED]",
    )
    .replace(
      /((?:PURSUIT_TOKEN|authorization|api[_-]?key|access[_-]?token)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}

/** Sanitize values before JSON encoding so quotes/newlines cannot corrupt state JSON. */
export function redactJson<T>(value: T, secrets: string[] = []): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "string" ? redact(item, secrets) : item,
    ),
  ) as T;
}
