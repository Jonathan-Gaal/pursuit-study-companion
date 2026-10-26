/** Stable releases only; prereleases never enter the student update channel. */
export function stableVersion(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ||
    value.split(".").some((part) => !Number.isSafeInteger(Number(part)))
  )
    throw new Error("Expected a stable major.minor.patch version.");
  return value;
}
export function compareVersions(left: string, right: string): number {
  const a = stableVersion(left).split(".").map(Number),
    b = stableVersion(right).split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return 0;
}
export function nextVersion(current: string, bump: string): string {
  const [major, minor, patch] = stableVersion(current)
    .split(".")
    .map(Number) as [number, number, number];
  const next =
    bump === "major"
      ? `${major + 1}.0.0`
      : bump === "minor"
        ? `${major}.${minor + 1}.0`
        : bump === "patch"
          ? `${major}.${minor}.${patch + 1}`
          : stableVersion(bump);
  stableVersion(next);
  if (compareVersions(next, current) <= 0)
    throw new Error("Release version must increase.");
  return next;
}
