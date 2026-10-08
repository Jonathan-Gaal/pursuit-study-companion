import { exactDate, localCalendarDate } from "../config/calendar.js";
import { limits } from "../config/limits.js";
import { projectRoot } from "../config/index.js";
import {
  daySelection,
  configuredDayIds,
  fullDetailsPath,
  type DaySelection,
} from "../config/daySelection.js";
import { parseDay } from "./parser.js";
import type { Day } from "../types/index.js";
import type { PursuitReader } from "./client.js";
import { ReadOnlyHttpClient } from "./http.js";
import { EnvironmentTokenSource } from "./auth.js";
import {
  enrichCompletion,
  parseCompletion,
  type CompletionStatus,
} from "./completion.js";
import { CurriculumCohortMismatchError, PursuitReadError } from "./errors.js";
import { cohortCandidates } from "../config/cohorts.js";
import {
  loadDiscoveredDays,
  saveDiscoveredDays,
  type DiscoveredDay,
} from "./dayDiscovery.js";
export interface SelectionOptions {
  overrideDayId?: number;
  now?: () => Date;
  timeZone?: string;
  dayIds?: number[];
  expected?: { date: string; dayId: number };
  discoverDayIds?: boolean;
  root?: string;
}
export class LivePursuitClient implements PursuitReader {
  #http: ReadOnlyHttpClient;
  #selection?: DaySelection;
  #options: SelectionOptions;
  constructor(
    http = new ReadOnlyHttpClient(new EnvironmentTokenSource()),
    selection?: DaySelection,
    options: SelectionOptions = {},
  ) {
    this.#http = http;
    this.#selection = selection;
    this.#options = options;
  }
  async getCompletion(taskId: number): Promise<CompletionStatus> {
    if (!Number.isSafeInteger(taskId) || taskId <= 0)
      throw new PursuitReadError("BLOCKED");
    return parseCompletion(
      await this.#http.request(
        "GET",
        `/api/learning/task-completion-status/${taskId}`,
      ),
    );
  }
  /** Verified curriculum GET only; callers may enrich completion after date selection. */
  async loadDefinitions(
    selection: DaySelection,
    allowedHistoricalCohorts: readonly string[] = [],
  ): Promise<Day & { dayId: number }> {
    const path = fullDetailsPath(selection);
    const raw = await this.#http.request("GET", path);
    if (
      !raw ||
      typeof raw !== "object" ||
      !("day" in raw) ||
      !raw.day ||
      typeof raw.day !== "object"
    )
      throw new PursuitReadError("SCHEMA");
    const metadata = raw.day as Record<string, unknown>;
    if (metadata.id !== selection.dayId) throw new PursuitReadError("SCHEMA");
    if (metadata.cohort !== selection.cohort) {
      if (
        typeof metadata.cohort === "string" &&
        allowedHistoricalCohorts.includes(metadata.cohort)
      )
        throw new CurriculumCohortMismatchError(metadata.cohort);
      throw new PursuitReadError("SCHEMA");
    }
    let day: Day;
    try {
      day = parseDay(raw);
    } catch {
      throw new PursuitReadError("SCHEMA");
    }
    return {
      ...day,
      dayId: selection.dayId,
      cohort: selection.cohort,
      sourcePath: path,
      source: "live",
      ...(Number.isSafeInteger(metadata.day_number) &&
      Number(metadata.day_number) > 0
        ? { dayNumber: Number(metadata.day_number) }
        : {}),
    };
  }
  async loadDay(): Promise<Day> {
    if (this.#selection || this.#options.overrideDayId !== undefined) {
      const selection =
        this.#selection ??
        daySelection({
          ...process.env,
          PURSUIT_DAY_ID: String(this.#options.overrideDayId),
        });
      return enrichCompletion(
        {
          ...(await this.loadDefinitions(selection)),
          selection: "historical",
        },
        this,
      );
    }
    const cohorts = cohortCandidates();
    const ids = this.#options.dayIds ?? configuredDayIds();
    // Validate all IDs and resource bounds before starting any network activity.
    configuredDayIds({ PURSUIT_DAY_IDS: ids.join(",") });
    const date = localCalendarDate(
      (this.#options.now ?? (() => new Date()))(),
      this.#options.timeZone ?? process.env.PURSUIT_TIME_ZONE,
    );
    const discover =
      this.#options.discoverDayIds ??
      (this.#options.dayIds === undefined &&
        this.#options.now === undefined &&
        this.#options.expected === undefined);
    const root = this.#options.root ?? projectRoot;
    const cached = discover ? await loadDiscoveredDays(root, date) : [];
    const candidateIds = [
      ...new Set([...ids, ...cached.map((day) => day.dayId)]),
    ];
    configuredDayIds({ PURSUIT_DAY_IDS: candidateIds.join(",") });
    const days: (Day & { dayId: number })[] = [];
    const discovered: DiscoveredDay[] = [...cached];
    const loadCandidate = async (id: number) => {
      for (const cohort of cohorts) {
        try {
          const day = await this.loadDefinitions({ dayId: id, cohort });
          days.push(day);
          if (!ids.includes(id)) discovered.push({ dayId: id, date: day.date });
          return;
        } catch (error) {
          if (error instanceof PursuitReadError && error.code === "NO_DAY")
            continue;
          throw error;
        }
      }
    };
    for (const id of candidateIds) await loadCandidate(id);
    if (discover) {
      const remainingDays = Math.max(0, limits.maxDays - candidateIds.length);
      const anchor = Math.max(...candidateIds);
      for (let offset = 1; offset <= remainingDays; offset++) {
        const id = anchor + offset;
        if (!Number.isSafeInteger(id)) throw new PursuitReadError("LIMIT");
        await loadCandidate(id);
      }
      await saveDiscoveredDays(root, discovered, date);
    }
    if (days.length > limits.maxDays) throw new PursuitReadError("LIMIT");
    const selected = exactDate(days, date);
    const expected =
      this.#options.expected ??
      (process.env.PURSUIT_EXPECTED_DATE && process.env.PURSUIT_EXPECTED_DAY_ID
        ? {
            date: process.env.PURSUIT_EXPECTED_DATE,
            dayId: Number(process.env.PURSUIT_EXPECTED_DAY_ID),
          }
        : undefined);
    if (expected?.date === date && selected.dayId !== expected.dayId)
      throw new PursuitReadError("SCHEMA");
    return enrichCompletion(
      { ...selected, selection: "automatic-preflight" },
      this,
    );
  }
}
