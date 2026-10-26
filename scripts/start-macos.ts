import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLocalEnvironment } from "../src/config/environment.js";

const run = promisify(execFile);
if (process.platform !== "darwin")
  throw new Error(
    "Native sign-in requires macOS. Use npm start for the browser app.",
  );
await loadLocalEnvironment();
const root = resolve(process.cwd());
const port = process.env.PURSUIT_DASHBOARD_PORT ?? "4782";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error("Invalid local port");
const app = resolve(root, "Pursuit Study Companion.app");
const contents = resolve(app, "Contents");
await mkdir(resolve(contents, "MacOS"), { recursive: true });
await mkdir(resolve(root, ".runtime/swift-module-cache"), { recursive: true });
const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const version = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
).version;
const values = {
  CFBundleShortVersionString: version,
  CFBundleVersion: version,
  CFBundleExecutable: "Pursuit Study Companion",
  CFBundleIdentifier: "local.pursuit.study-companion",
  CFBundleName: "Pursuit Study Companion",
  CFBundlePackageType: "APPL",
  PursuitProjectRoot: root,
  PursuitNodePath: process.execPath,
  PursuitDashboardPort: port,
};
await writeFile(
  resolve(contents, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>${Object.entries(
    values,
  )
    .map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`)
    .join(
      "",
    )}<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`,
);
console.log("Building the macOS sign-in app…");
await run("/usr/bin/swiftc", [
  "-parse-as-library",
  "-O",
  "-module-cache-path",
  resolve(root, ".runtime/swift-module-cache"),
  "-framework",
  "Cocoa",
  "-framework",
  "WebKit",
  resolve(root, "src/macos/App.swift"),
  "-o",
  resolve(contents, "MacOS/Pursuit Study Companion"),
]);
await run("/usr/bin/codesign", ["--force", "--sign", "-", app]);
if (!process.argv.includes("--build-only")) await run("/usr/bin/open", [app]);
console.log(
  process.argv.includes("--build-only")
    ? "macOS app built."
    : "Opened Pursuit Study Companion. Choose Sign in to Pursuit in Settings.",
);
