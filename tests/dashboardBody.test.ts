import { it, expect } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { readDashboardJson } from "../src/dashboard/body.js";

function request(chunks: string[], headers: Record<string, string> = {}) {
  return Object.assign(Readable.from(chunks), {
    headers,
  }) as unknown as IncomingMessage;
}
it("parses bounded JSON across chunks", async () => {
  expect(await readDashboardJson(request(['{"text":', '"my notes"}']))).toEqual(
    { text: "my notes" },
  );
});
it("rejects oversized bodies regardless of declared content length", async () => {
  await expect(readDashboardJson(request(["x".repeat(40001)]))).rejects.toThrow(
    "too large",
  );
  await expect(
    readDashboardJson(request(["{}"], { "content-length": "40001" })),
  ).rejects.toThrow("too large");
});
it("rejects malformed JSON rather than accepting an uncertain local write", async () => {
  await expect(readDashboardJson(request(['{"text":']))).rejects.toThrow();
});
