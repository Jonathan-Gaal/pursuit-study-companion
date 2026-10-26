import type { DashboardAuth } from "./auth.js";
import {
  expandStudy,
  savedStudyAdditions,
} from "../learning/studyExpansion.js";
import type { IncomingHttpHeaders } from "node:http";
import type { HistoryStore } from "../history/store.js";
import type { AssignmentProgress } from "../reporting/assignmentProgress.js";
import { isLocalDashboardRequest } from "./security.js";
import { linkStudySources } from "../learning/sourceLinks.js";
import { validDate } from "../pursuit/parser.js";
import { localCalendarDate } from "../config/calendar.js";
import { buildLibrary, readLibraryNote } from "../learning/library.js";
import { resourcesOverview } from "../history/resources.js";
import {
  obsidianExport,
  prepareObsidianArchive,
} from "../learning/obsidian.js";

interface Request {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
}
interface Dependencies {
  auth?: Pick<DashboardAuth, "status" | "accept" | "poll">;
  afterSignIn?: () => void;
  openSignIn?: () => Promise<void>;
  catchUp?: () => { running: boolean; message: string; imported: number };
  root: string;
  buildId?: string;
  port: number;
  history: HistoryStore;
  active: () => Promise<string | null>;
  progress: () => Promise<AssignmentProgress | null>;
  start: (kind: "study", date?: string) => Promise<boolean>;
  readJson?: () => Promise<unknown>;
  refreshDay?: (date: string) => Promise<void>;
}
export async function dashboardApi(req: Request, deps: Dependencies) {
  const response = (status: number, body: unknown) => ({ status, body });
  if (!isLocalDashboardRequest(req.headers.host, req.headers.origin, deps.port))
    return response(403, { error: "Local dashboard only." });
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${deps.port}`);
  if (req.method === "POST" && url.pathname === "/api/auth/open") {
    if (
      url.search ||
      req.headers["transfer-encoding"] ||
      Number(req.headers["content-length"] ?? 0) !== 0
    )
      return response(400, {
        error: "Sign-in requires an empty local request.",
      });
    if (!deps.openSignIn)
      return response(409, {
        error:
          "Native sign-in is available on macOS. Use local token setup on other platforms.",
      });
    try {
      await deps.openSignIn();
      return response(200, {
        message: "Pursuit sign-in opened in the native app.",
      });
    } catch {
      return response(409, {
        error:
          "Could not open native sign-in. Run npm run start:macos, then click Sign in to Pursuit in that app.",
      });
    }
  }
  if (
    deps.auth &&
    req.method === "POST" &&
    ["/api/auth/check", "/api/auth/token"].includes(url.pathname)
  ) {
    if (url.search) return response(400, { error: "Unexpected query." });
    try {
      if (url.pathname === "/api/auth/check")
        return response(200, await deps.auth.status(true));
      if (
        !/^application\/json\b/i.test(
          String(req.headers["content-type"] ?? ""),
        ) ||
        !deps.readJson
      )
        return response(400, { error: "A local JSON request is required." });
      const body = await deps.readJson();
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).some((k) => k !== "token")
      )
        return response(400, { error: "Invalid authentication request." });
      if (await deps.active())
        return response(409, {
          error: "Wait for the active operation to finish.",
        });
      const status = await deps.auth.accept(
        (body as { token?: unknown }).token,
      );
      deps.afterSignIn?.();
      return response(200, status);
    } catch {
      return response(400, {
        error:
          "Could not verify and save the Pursuit token. Sign in again or check your connection.",
      });
    }
  }
  if (
    ["GET", "POST"].includes(req.method ?? "") &&
    url.pathname === "/api/obsidian"
  ) {
    const date = url.searchParams.get("date") ?? undefined;
    if (
      (date !== undefined && !validDate(date)) ||
      [...url.searchParams.keys()].some((key) => key !== "date") ||
      url.searchParams.getAll("date").length > 1 ||
      req.headers["transfer-encoding"] ||
      Number(req.headers["content-length"] ?? 0) !== 0
    )
      return response(400, { error: "Invalid export selection." });
    try {
      const result = await obsidianExport(deps.root, deps.history, date);
      if (req.method === "POST") {
        if (!result.noteCount)
          return response(409, { error: "No saved study notes to export." });
        return response(200, {
          noteCount: result.noteCount,
          warnings: result.warnings,
          path: await prepareObsidianArchive(deps.root, result.files),
          connected: false,
        });
      }
      return response(200, result);
    } catch {
      return response(400, {
        error: "Could not prepare saved notes for export.",
      });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/resources")
    return response(200, resourcesOverview(deps.history));
  if (req.method === "GET" && url.pathname === "/api/library") {
    const week =
      url.searchParams.get("week") ??
      localCalendarDate(new Date(), process.env.PURSUIT_TIME_ZONE);
    const query = url.searchParams.get("q") ?? "";
    if (
      !validDate(week) ||
      query.length > 200 ||
      [...url.searchParams.keys()].some((key) => !["q", "week"].includes(key))
    )
      return response(400, { error: "Invalid library query." });
    return response(
      200,
      await buildLibrary(deps.root, deps.history, week, query),
    );
  }
  if (req.method === "GET" && url.pathname === "/api/annotations") {
    const date = url.searchParams.get("date") ?? "";
    if (
      !validDate(date) ||
      !deps.history.day(date) ||
      [...url.searchParams.keys()].some((key) => key !== "date")
    )
      return response(400, { error: "Choose a saved day." });
    return response(200, deps.history.annotation(date));
  }
  if (
    req.method === "POST" &&
    ["/api/annotations", "/api/review"].includes(url.pathname)
  ) {
    if (
      url.search ||
      !deps.readJson ||
      !/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))
    )
      return response(400, { error: "A local JSON request is required." });
    let body: Record<string, unknown>;
    try {
      const raw = await deps.readJson();
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid body");
      body = raw as Record<string, unknown>;
      if (
        typeof body.date !== "string" ||
        !validDate(body.date) ||
        !deps.history.day(body.date)
      )
        throw new Error("Invalid date");
      if (url.pathname === "/api/annotations") {
        if (
          Object.keys(body).some(
            (key) => !["date", "text", "revision"].includes(key),
          ) ||
          typeof body.text !== "string" ||
          typeof body.revision !== "number"
        )
          throw new Error("Invalid annotation");
        return response(
          200,
          deps.history.saveAnnotation(body.date, body.text, body.revision),
        );
      }
      if (
        Object.keys(body).some(
          (key) => !["date", "cardId", "rating"].includes(key),
        ) ||
        typeof body.cardId !== "string" ||
        !["again", "hard", "good", "easy"].includes(String(body.rating))
      )
        throw new Error("Invalid review");
      const library = await buildLibrary(deps.root, deps.history, body.date);
      if (
        !library.cards.some(
          (card) => card.id === body.cardId && card.date === body.date,
        )
      )
        throw new Error("Unknown card");
      deps.history.recordReview(
        body.cardId,
        body.date,
        body.rating as "again" | "hard" | "good" | "easy",
      );
      return response(200, { status: "SAVED" });
    } catch {
      return response(409, {
        error:
          "Could not save. Reload the saved entry and try again; oversized or stale changes are rejected.",
      });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/status")
    return response(200, {
      auth: await deps.auth?.poll(),
      buildId: deps.buildId,
      catchUp: deps.catchUp?.(),
      today: localCalendarDate(new Date(), process.env.PURSUIT_TIME_ZONE),
      running: await deps.active(),
      progress: await deps.progress(),
      days: deps.history.listDays(),
      runs: deps.history.runs(),
    });
  if (
    req.method === "POST" &&
    url.pathname === "/api/day/refresh" &&
    deps.refreshDay
  ) {
    const date = url.searchParams.get("date") ?? "";
    if (
      !validDate(date) ||
      [...url.searchParams.keys()].some((key) => key !== "date") ||
      req.headers["transfer-encoding"] ||
      Number(req.headers["content-length"] ?? 0) !== 0
    )
      return response(400, {
        error: "A saved date and empty request body are required.",
      });
    if (await deps.active())
      return response(409, { error: "Wait for the active run to finish." });
    try {
      await deps.refreshDay(date);
      return response(200, { status: "REFRESHED" });
    } catch {
      return response(409, {
        error:
          "Could not refresh this saved day. It needs a verified live source and valid local authentication; saved notes were preserved.",
      });
    }
  }
  if (req.method === "POST" && url.pathname === "/api/study/expand") {
    const date = url.searchParams.get("date") ?? "";
    const section = url.searchParams.get("section") ?? "";
    if (
      !validDate(date) ||
      !/^section-[1-9]\d*$/.test(section) ||
      url.searchParams.getAll("date").length !== 1 ||
      url.searchParams.getAll("section").length !== 1 ||
      [...url.searchParams.keys()].some(
        (k) => !["date", "section"].includes(k),
      ) ||
      req.headers["transfer-encoding"] ||
      Number(req.headers["content-length"] ?? 0) !== 0
    )
      return response(400, {
        error: "Choose a saved study section with an empty request body.",
      });
    if (await deps.active())
      return response(409, { error: "Wait for the active run to finish." });
    try {
      return response(200, {
        studyAdditions: await expandStudy(
          deps.root,
          deps.history,
          date,
          section,
        ),
      });
    } catch {
      return response(409, {
        error:
          "Could not add new study detail. Another expansion may be running, the provider may be unavailable, or its output repeated existing material. Your saved notes are unchanged.",
      });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/day") {
    const date = url.searchParams.get("date") ?? "";
    if (!validDate(date)) return response(400, { error: "Invalid date." });
    const day = deps.history.day(date);
    if (!day) return response(404, { error: "Day not found." });
    let note: string | null = null;
    try {
      note = await readLibraryNote(deps.root, date);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return response(200, {
      ...day,
      studyAdditions: await savedStudyAdditions(deps.root, date),
      noteContent: note
        ? linkStudySources(
            note,
            date,
            day.tasks
              .filter((task) => !task.protected_kind)
              .map((task) => Number(task.task_id)),
          )
        : note,
    });
  }
  if (req.method === "POST" && url.pathname === "/api/study") {
    const date = url.searchParams.get("date") ?? undefined;
    if (
      (date !== undefined && !validDate(date)) ||
      [...url.searchParams.keys()].some((key) => key !== "date") ||
      url.searchParams.getAll("date").length > 1 ||
      req.headers["transfer-encoding"] ||
      Number(req.headers["content-length"] ?? 0) !== 0
    )
      return response(400, {
        error: "Choose a date with an empty request body.",
      });
    if (await deps.active())
      return response(409, { error: "A study run is active." });
    return (await deps.start("study", date))
      ? response(202, { status: "RUNNING" })
      : response(409, { error: "A study run is active." });
  }
  if (url.pathname.startsWith("/api/"))
    return response(404, { error: "Not found." });
  return null;
}
