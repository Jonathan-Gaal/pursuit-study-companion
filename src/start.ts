import { spawn, execFile } from "node:child_process";
import { resolve } from "node:path";
import { loadLocalEnvironment } from "./config/environment.js";
await loadLocalEnvironment();
const port = Number(process.env.PURSUIT_DASHBOARD_PORT ?? "4782");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid local port");
const url = `http://127.0.0.1:${port}`;
function openBrowser() {
  if (process.platform === "darwin" && !process.argv.includes("--browser")) {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", resolve("scripts/start-macos.ts")],
      { stdio: "inherit", env: process.env },
    );
    child.on("error", () =>
      console.error("Could not open the macOS app. Use npm run start:browser."),
    );
    child.on("exit", (code) => {
      if (code)
        console.error(
          "Could not build the macOS app. Install Xcode Command Line Tools or use npm run start:browser.",
        );
    });
    return;
  }
  const program =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32"
        : "xdg-open";
  execFile(
    program,
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url],
    () => {},
  );
}
try {
  const response = await fetch(url + "/api/status", {
    signal: AbortSignal.timeout(1500),
    redirect: "error",
  });
  const status = await response.json();
  if (!response.ok || status.app !== "pursuit-study-companion")
    throw new Error("Port used by another application");
  openBrowser();
} catch (error) {
  if ((error as { cause?: { code?: string } }).cause?.code !== "ECONNREFUSED") {
    console.error(
      "Could not open the app. Check whether the local port is available.",
    );
    process.exitCode = 1;
  } else {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", resolve("src/dashboard/server.ts")],
      {
        stdio: "inherit",
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      },
    );
    child.on("error", () => {
      process.exitCode = 1;
    });
    child.on("exit", (code) => {
      process.exitCode = code ?? 1;
    });
    const timer = setInterval(() => {
      void fetch(url + "/api/status", { signal: AbortSignal.timeout(1000) })
        .then(async (response) => {
          if (
            response.ok &&
            (await response.json()).app === "pursuit-study-companion"
          ) {
            clearInterval(timer);
            openBrowser();
          }
        })
        .catch(() => {});
    }, 1000);
    setTimeout(() => clearInterval(timer), 30000).unref();
  }
}
