import { limits } from "../config/limits.js";
import type { TokenSource } from "./auth.js";
import { CurriculumUnavailableError, PursuitReadError } from "./errors.js";
export const PURSUIT_ORIGIN = "https://test-pilot-server.onrender.com";
export const GET_ALLOWLIST = Object.freeze([
  /^\/api\/learning\/task-completion-status\/[1-9]\d*$/,
]);
export function allowedReadPath(path: string): boolean {
  if (GET_ALLOWLIST.some((rule) => rule.test(path))) return true;
  if (
    !/^\/api\/curriculum\/days\/[1-9]\d*\/full-details\?cohort=[^&#]+$/.test(
      path,
    )
  )
    return false;
  try {
    const url = new URL(path, PURSUIT_ORIGIN);
    const id = Number(url.pathname.split("/")[4]);
    const cohort = url.searchParams.get("cohort");
    return (
      url.origin === PURSUIT_ORIGIN &&
      Number.isSafeInteger(id) &&
      id > 0 &&
      !!cohort?.trim() &&
      cohort.length <= 200 &&
      !/[\r\n\x00]/.test(cohort)
    );
  } catch {
    return false;
  }
}
const REQUEST_TIMEOUT_MS = 3_000;
const TOTAL_READ_TIMEOUT_MS = 20_000;
export type FetchRead = (
  url: string,
  options: RequestInit,
) => Promise<Response>;
/** No caller-supplied URLs, headers, redirects, request bodies, or retry policies. */
export class ReadOnlyHttpClient {
  #tokens: TokenSource;
  #fetch: FetchRead;
  #calls = 0;
  #started: number | null = null;
  #stopped = false;
  constructor(tokens: TokenSource, fetchRead: FetchRead = globalThis.fetch) {
    this.#tokens = tokens;
    this.#fetch = fetchRead;
  }
  async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    // Check the verb and exact path before authentication or any network activity.
    if (
      method !== "GET" ||
      body !== undefined ||
      typeof path !== "string" ||
      !allowedReadPath(path)
    )
      throw new PursuitReadError("BLOCKED");
    const now = Date.now();
    this.#started ??= now;
    if (
      this.#stopped ||
      this.#calls >= limits.maxTasks + limits.maxDays ||
      now - this.#started >= TOTAL_READ_TIMEOUT_MS
    )
      throw new PursuitReadError("LIMIT");
    const token = this.#tokens.getToken();
    this.#calls++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.#read(path, token, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => {
              this.#stopped = true;
              controller.abort();
              reject(new PursuitReadError("TIMEOUT"));
            },
            Math.min(
              REQUEST_TIMEOUT_MS,
              TOTAL_READ_TIMEOUT_MS - (now - this.#started!),
            ),
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof PursuitReadError) {
        if (
          error.code === "AUTH" ||
          error.code === "LIMIT" ||
          error.code === "TIMEOUT"
        )
          this.#stopped = true;
        throw error;
      }
      throw new PursuitReadError("HTTP");
    } finally {
      controller.abort();
      if (timer) clearTimeout(timer);
    }
  }
  async #read(
    path: string,
    token: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await this.#fetch(`${PURSUIT_ORIGIN}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      credentials: "omit",
      signal,
    });
    if (response.status === 429) throw new PursuitReadError("LIMIT");
    if (response.status === 401) throw new PursuitReadError("AUTH");
    if (
      (response.status === 403 || response.status === 404) &&
      path.startsWith("/api/curriculum/days/")
    )
      throw new CurriculumUnavailableError(response.status as 403 | 404);
    if (response.status === 403) throw new PursuitReadError("AUTH");
    if (
      !response.ok ||
      response.redirected ||
      (response.status >= 300 && response.status < 400)
    )
      throw new PursuitReadError("HTTP");
    if (
      !/^application\/json\b/i.test(response.headers.get("content-type") ?? "")
    )
      throw new PursuitReadError("SCHEMA");
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > limits.maxFileBytes)
    ) {
      await response.body?.cancel();
      throw new PursuitReadError("LIMIT");
    }
    if (!response.body) throw new PursuitReadError("SCHEMA");
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limits.maxFileBytes) throw new PursuitReadError("LIMIT");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new PursuitReadError("SCHEMA");
    }
  }
}
