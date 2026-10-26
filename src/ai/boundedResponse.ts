export async function boundedResponse(
  response: Response,
  ceiling = 100_000,
  acceptedErrorStatus?: number,
): Promise<unknown> {
  if (
    (!response.ok && response.status !== acceptedErrorStatus) ||
    response.redirected ||
    !/^application\/json\b/i.test(response.headers.get("content-type") ?? "") ||
    !response.body
  )
    throw new Error("Unexpected API response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ceiling) throw new Error("API response exceeds size limit.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
