import { stableVersion } from "./version.js";
export interface PublishedRelease {
  version: string;
  tag: string;
}
export type ReleaseLookup = (
  repository: string,
) => Promise<PublishedRelease | null>;
/** Public GitHub metadata only. Never send the student's Pursuit or provider credentials. */
export const latestRelease: ReleaseLookup = async (repository) => {
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*?)(?:\.git)?$/.exec(
      repository,
    );
  if (!match) throw new Error("Invalid release repository.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(
      `https://api.github.com/repos/${match[1]}/${match[2]}/releases/latest`,
      {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
        },
      },
    );
    if (response.status === 404) return null;
    if (!response.ok || !response.body)
      throw new Error("Release check unavailable.");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > 128000) throw new Error("Release metadata too large.");
      chunks.push(result.value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      value.draft !== false ||
      value.prerelease !== false ||
      typeof value.tag_name !== "string" ||
      !value.tag_name.startsWith("v")
    )
      throw new Error("Invalid stable release.");
    const version = stableVersion(value.tag_name.slice(1));
    return { version, tag: `v${version}` };
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
  }
};
