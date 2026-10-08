import type { IncomingMessage } from "node:http";

/** Only the two local learning-data endpoints consume JSON; never Pursuit writes. */
export async function readDashboardJson(
  req: IncomingMessage,
): Promise<unknown> {
  const maximum = 40000;
  if (Number(req.headers["content-length"] ?? 0) > maximum)
    throw new Error("Body too large");
  const timer = setTimeout(() => req.destroy(), 5000);
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maximum) throw new Error("Body too large");
      chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    clearTimeout(timer);
  }
}
