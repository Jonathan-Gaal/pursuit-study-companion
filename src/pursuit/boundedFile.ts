import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { limits } from "../config/limits.js";
/** Reject pipes/devices/symlinks and read at most the byte ceiling, even if a file grows. */
export async function readBoundedJson(path: string): Promise<unknown> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limits.maxFileBytes)
      throw new Error("Input must be a regular JSON file within size limit");
    const buffer = Buffer.alloc(limits.maxFileBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limits.maxFileBytes)
      throw new Error("JSON file exceeds size limit");
    return JSON.parse(buffer.subarray(0, length).toString("utf8"));
  } finally {
    await handle.close();
  }
}
