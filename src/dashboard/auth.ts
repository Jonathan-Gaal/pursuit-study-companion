import type { HistoryStore } from "../history/store.js";
import { loadLocalEnvironment } from "../config/environment.js";
import { tokenExpiry, validTokenInput } from "../pursuit/tokenStatus.js";
import { saveLocalToken } from "../pursuit/tokenStore.js";
import { LivePursuitClient } from "../pursuit/liveClient.js";
import { ReadOnlyHttpClient } from "../pursuit/http.js";
import { configuredDayIds, daySelection } from "../config/daySelection.js";
import { PursuitReadError } from "../pursuit/errors.js";

export interface AuthStatus {
  state: "MISSING" | "EXPIRED" | "REJECTED" | "VERIFIED" | "UNKNOWN";
  message: string;
  expiresAt: string | null;
  checkedAt: string | null;
}
export class DashboardAuth {
  private lastStatus: AuthStatus = {
    state: "UNKNOWN",
    message: "Checking Pursuit connection…",
    expiresAt: null,
    checkedAt: null,
  };
  private cached?: AuthStatus;
  private checkedToken = "";
  private pending?: Promise<AuthStatus>;
  constructor(
    private root: string,
    private history: HistoryStore,
    private verify: (token: string) => Promise<void> = async (token) => {
      const task = this.history.listDays().flatMap((row) => {
        const saved = this.history.day(String(row.date));
        return saved?.source === "live"
          ? saved.tasks.filter((t) => !t.protected_kind)
          : [];
      })[0];
      const client = new LivePursuitClient(
        new ReadOnlyHttpClient({ getToken: () => token }),
      );
      if (task) await client.getCompletion(Number(task.task_id));
      else
        await client.loadDefinitions(
          daySelection({
            ...process.env,
            PURSUIT_DAY_ID: String(configuredDayIds()[0]),
          }),
        );
    },
    private reload: () => Promise<void> = () => loadLocalEnvironment(),
  ) {}
  // Dashboard readiness must never wait for the remote service.
  async poll(): Promise<AuthStatus> {
    void this.status().catch(() => {});
    return this.lastStatus;
  }
  async status(force = false): Promise<AuthStatus> {
    const result = await this.check(force);
    this.lastStatus = result;
    return result;
  }
  private async check(force = false): Promise<AuthStatus> {
    try {
      await this.reload();
    } catch {
      return {
        state: "UNKNOWN",
        message: "Could not read local authentication configuration.",
        expiresAt: null,
        checkedAt: null,
      };
    }
    const token = process.env.PURSUIT_TOKEN?.trim() ?? "";
    const expires = tokenExpiry(token);
    const base = {
      expiresAt: expires ? new Date(expires).toISOString() : null,
      checkedAt: null,
    };
    if (!token || token === "your_token_here")
      return {
        ...base,
        state: "MISSING",
        message: "Sign in to connect Pursuit.",
      };
    if (expires && expires <= Date.now())
      return {
        ...base,
        state: "EXPIRED",
        message: "Token expired — sign in to Pursuit.",
      };
    if (
      this.checkedToken === token &&
      this.cached &&
      !force &&
      Date.now() - Date.parse(this.cached.checkedAt!) < 300_000
    )
      return this.cached;
    if (this.pending) {
      await this.pending;
      return this.status(force);
    }
    this.pending = (async () => {
      let status: AuthStatus;
      try {
        await this.verify(token);
        status = {
          ...base,
          state: "VERIFIED",
          checkedAt: new Date().toISOString(),
          message: "Connected — verified by Pursuit.",
        };
      } catch (error) {
        status = {
          ...base,
          checkedAt: new Date().toISOString(),
          state:
            error instanceof PursuitReadError && error.code === "AUTH"
              ? "REJECTED"
              : "UNKNOWN",
          message:
            error instanceof PursuitReadError && error.code === "AUTH"
              ? "Token rejected — sign in to Pursuit."
              : "Could not verify connection. Check your network and try again.",
        };
      }
      this.cached = status;
      this.checkedToken = token;
      return status;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  async accept(value: unknown) {
    if (!validTokenInput(value)) throw new Error("Invalid token format.");
    const expiry = tokenExpiry(value);
    if (expiry && expiry <= Date.now())
      throw new Error("Token expired. Sign in again.");
    // No credential is persisted until Pursuit accepts an allowlisted read.
    await this.verify(value);
    await saveLocalToken(this.root, value);
    process.env.PURSUIT_TOKEN = value;
    this.checkedToken = value;
    this.cached = {
      state: "VERIFIED",
      message: "Connected — verified by Pursuit.",
      expiresAt: expiry ? new Date(expiry).toISOString() : null,
      checkedAt: new Date().toISOString(),
    };
    this.lastStatus = this.cached;
    return this.cached;
  }
}
