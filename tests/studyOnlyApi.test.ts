import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { HistoryStore } from "../src/history/store.js";
import { dashboardApi } from "../src/dashboard/api.js";

it("has no assignment automation endpoint and rejects cross-origin local writes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "study-only-api-"));
  const history = new HistoryStore(root);
  let starts = 0;
  const deps = {
    root,
    port: 4782,
    history,
    active: async () => null,
    progress: async () => null,
    start: async () => {
      starts++;
      return true;
    },
  };
  try {
    for (const path of [
      "/api/tasks",
      "/api/submissions",
      "/api/conversation",
      "/api/schedule/enable",
    ])
      expect(
        (
          await dashboardApi(
            { method: "POST", url: path, headers: { host: "127.0.0.1:4782" } },
            deps,
          )
        )?.status,
      ).toBe(404);
    expect(starts).toBe(0);
    expect(
      (
        await dashboardApi(
          {
            method: "POST",
            url: "/api/study",
            headers: {
              host: "127.0.0.1:4782",
              origin: "https://outside.invalid",
            },
          },
          deps,
        )
      )?.status,
    ).toBe(403);
    expect(starts).toBe(0);
  } finally {
    history.close();
    await rm(root, { recursive: true, force: true });
  }
});
