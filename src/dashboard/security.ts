export function isLocalDashboardRequest(
  host: string | undefined,
  origin: string | undefined,
  port: number,
): boolean {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  return (
    !!host &&
    allowed.includes(host) &&
    (!origin || allowed.map((value) => `http://${value}`).includes(origin))
  );
}
