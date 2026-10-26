import { expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { dashboardApi } from "../src/dashboard/api.js";
import type { HistoryStore } from "../src/history/store.js";

async function capture(origin = "https://platform.pursuit.org", status = 200) {
  const report = vi.fn();
  const fetch = vi.fn(
    async (_input: string, _init?: RequestInit) => new Response("", { status }),
  );
  class XHR {
    open() {}
    setRequestHeader() {}
    addEventListener() {}
  }
  const window = {
    fetch,
    webkit: { messageHandlers: { pursuitToken: { postMessage: report } } },
  };
  runInNewContext(
    await readFile(
      new URL("../src/pursuit/captureToken.js", import.meta.url),
      "utf8",
    ),
    {
      location: { origin, href: `${origin}/learning` },
      window,
      Request,
      Headers,
      URL,
      XMLHttpRequest: XHR,
    },
  );
  return { window, report, fetch };
}
const bearer = "Bearer testheader.testpayload.testsignature";
it("captures successful authenticated API requests only, once, preserving normal responses", async () => {
  const { window, report } = await capture();
  const response = await window.fetch(
    "https://test-pilot-server.onrender.com/api/curriculum/days/1/full-details",
    { headers: { Authorization: bearer } },
  );
  expect(response.status).toBe(200);
  expect(report).toHaveBeenCalledWith(bearer.slice(7));
  await window.fetch("https://test-pilot-server.onrender.com/api/another", {
    headers: { Authorization: bearer },
  });
  expect(report).toHaveBeenCalledTimes(1);
});
it("never captures third-party pages, unrelated requests or failed authentication", async () => {
  const outside = await capture("https://example.com");
  await outside.window.fetch(
    "https://test-pilot-server.onrender.com/api/check",
    { headers: { Authorization: bearer } },
  );
  expect(outside.report).not.toHaveBeenCalled();
  const platform = await capture();
  await platform.window.fetch("https://example.com/api/check", {
    headers: { Authorization: bearer },
  });
  expect(platform.report).not.toHaveBeenCalled();
  const rejected = await capture("https://platform.pursuit.org", 401);
  await rejected.window.fetch(
    "https://test-pilot-server.onrender.com/api/check",
    { headers: { Authorization: bearer } },
  );
  expect(rejected.report).not.toHaveBeenCalled();
});
it("protects the local token receiver against cross-origin and malformed requests and returns no raw errors", async () => {
  const accept = vi.fn(async (_token: unknown) => {
    throw new Error("raw private response");
  });
  const deps = {
    root: "/unused",
    port: 4781,
    history: {} as HistoryStore,
    active: async () => null,
    progress: async () => null,
    start: async () => false,
    readJson: async () => ({ token: "synthetic" }),
    auth: {
      status: async () => ({
        state: "VERIFIED" as const,
        message: "Connected",
        expiresAt: null,
        checkedAt: null,
      }),
      poll: async () => ({
        state: "UNKNOWN" as const,
        message: "Checking",
        expiresAt: null,
        checkedAt: null,
      }),
      accept,
    },
  };
  const result = await dashboardApi(
    {
      method: "POST",
      url: "/api/auth/token",
      headers: {
        host: "127.0.0.1:4781",
        origin: "https://example.com",
        "content-type": "application/json",
      },
    },
    deps,
  );
  expect(result?.status).toBe(403);
  expect(accept).not.toHaveBeenCalled();
  const badType = await dashboardApi(
    {
      method: "POST",
      url: "/api/auth/token",
      headers: { host: "127.0.0.1:4781" },
    },
    deps,
  );
  expect(badType?.status).toBe(400);
  expect(accept).not.toHaveBeenCalled();
  const failure = await dashboardApi(
    {
      method: "POST",
      url: "/api/auth/token",
      headers: { host: "127.0.0.1:4781", "content-type": "application/json" },
    },
    deps,
  );
  expect(failure?.status).toBe(400);
  expect(JSON.stringify(failure)).not.toContain("raw private");
});

it("starts sync only after verification succeeds and refuses captures while busy", async () => {
  const status = {
    state: "VERIFIED" as const,
    message: "Connected",
    checkedAt: null,
    expiresAt: null,
  };
  const accept = vi.fn(async (_token: unknown) => status);
  const afterSignIn = vi.fn();
  const deps = {
    root: "/unused",
    port: 4782,
    history: {} as HistoryStore,
    active: vi.fn(async (): Promise<string | null> => "study"),
    progress: async () => null,
    start: async () => false,
    readJson: async () => ({ token: "synthetic" }),
    auth: { status: async () => status, poll: async () => status, accept },
    afterSignIn,
  };
  const req = {
    method: "POST",
    url: "/api/auth/token",
    headers: { host: "127.0.0.1:4782", "content-type": "application/json" },
  };
  expect((await dashboardApi(req, deps))?.status).toBe(409);
  expect(accept).not.toHaveBeenCalled();
  expect(afterSignIn).not.toHaveBeenCalled();
  deps.active.mockResolvedValue(null);
  expect((await dashboardApi(req, deps))?.status).toBe(200);
  expect(accept).toHaveBeenCalledWith("synthetic");
  expect(afterSignIn).toHaveBeenCalledOnce();
  accept.mockRejectedValue(new Error("private"));
  expect((await dashboardApi(req, deps))?.status).toBe(400);
  expect(afterSignIn).toHaveBeenCalledOnce();
});

it("opens native sign-in only for an empty local POST", async () => {
  const openSignIn = vi.fn(async () => {});
  const deps = {
    root: "/unused",
    port: 4782,
    history: {} as HistoryStore,
    active: async () => null,
    progress: async () => null,
    start: async () => false,
    openSignIn,
  };
  const req = {
    method: "POST",
    url: "/api/auth/open",
    headers: { host: "127.0.0.1:4782" },
  };
  expect(
    (
      await dashboardApi(
        { ...req, headers: { ...req.headers, origin: "https://example.com" } },
        deps,
      )
    )?.status,
  ).toBe(403);
  expect(
    (
      await dashboardApi(
        { ...req, headers: { ...req.headers, "content-length": "1" } },
        deps,
      )
    )?.status,
  ).toBe(400);
  expect(openSignIn).not.toHaveBeenCalled();
  expect((await dashboardApi(req, deps))?.status).toBe(200);
  expect(openSignIn).toHaveBeenCalledOnce();
});
