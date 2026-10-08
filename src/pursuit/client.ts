import { readBoundedJson } from "./boundedFile.js";
import { parseDay } from "./parser.js";
import type { Day } from "../types/index.js";
export interface PursuitReader {
  loadDay(): Promise<Day>;
}
/** Fixture boundary only. Live schemas and daily endpoint remain unverified. No write API exists. */
export class FixturePursuitClient implements PursuitReader {
  constructor(private readonly path: string) {}
  async loadDay(): Promise<Day> {
    let raw: unknown;
    try {
      raw = await readBoundedJson(this.path);
    } catch {
      throw new Error("Could not load fixture JSON");
    }
    return parseDay(raw);
  }
}
