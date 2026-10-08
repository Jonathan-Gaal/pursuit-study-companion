import { limits } from "./limits.js";
/** Runs in the CLI parent, independently of the daily worker event loop. */
export function startWatchdog(terminate: () => void): () => void {
  const timer = setTimeout(terminate, limits.runTimeoutMs);
  return () => clearTimeout(timer);
}
