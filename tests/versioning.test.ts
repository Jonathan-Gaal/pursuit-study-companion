import { afterEach, expect, it, vi } from "vitest";
import {
  compareVersions,
  nextVersion,
  stableVersion,
} from "../src/updates/version.js";
import { latestRelease } from "../src/updates/releases.js";
afterEach(() => vi.unstubAllGlobals());
it("compares versions numerically and prepares patch/minor/major releases", () => {
  expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
  expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  expect(nextVersion("0.1.9", "patch")).toBe("0.1.10");
  expect(nextVersion("0.1.9", "minor")).toBe("0.2.0");
  expect(nextVersion("0.1.9", "major")).toBe("1.0.0");
  for (const bad of [
    "v1.2.3",
    "01.2.3",
    "1.0.0-beta.1",
    "1.0.0+abc",
    "1.2",
    "1.2.3\n",
    "999999999999999999999.0.0",
  ])
    expect(() => stableVersion(bad)).toThrow();
  expect(() => nextVersion("1.0.0", "0.9.9")).toThrow();
});
it("reads public release metadata without any student credentials or redirects", async () => {
  const fetch = vi.fn(
    async (_url: string, _options?: RequestInit) =>
      new Response(
        JSON.stringify({ tag_name: "v0.2.0", draft: false, prerelease: false }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  expect(await latestRelease("https://github.com/example/study.git")).toEqual({
    version: "0.2.0",
    tag: "v0.2.0",
  });
  expect(fetch.mock.calls[0]?.[0]).toBe(
    "https://api.github.com/repos/example/study/releases/latest",
  );
  const options = fetch.mock.calls[0]?.[1] as RequestInit | undefined;
  expect(options?.redirect).toBe("error");
  expect(new Headers(options?.headers).has("authorization")).toBe(false);
});
it("handles missing releases, rate limits, unsafe tags and bounded output", async () => {
  for (const response of [
    new Response("", { status: 429 }),
    new Response(
      JSON.stringify({
        tag_name: "../../bad",
        draft: false,
        prerelease: false,
      }),
    ),
    new Response(
      JSON.stringify({
        tag_name: "v1.0.0-beta.1",
        draft: false,
        prerelease: true,
      }),
    ),
    new Response("x".repeat(128001)),
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    await expect(
      latestRelease("https://github.com/example/study"),
    ).rejects.toThrow();
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  expect(await latestRelease("https://github.com/example/study")).toBeNull();
});
