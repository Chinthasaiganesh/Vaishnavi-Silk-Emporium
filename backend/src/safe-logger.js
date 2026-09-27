const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const diagnosticCodePattern = /^(?:[A-Z][A-Z0-9_]{0,63}|[0-9]{5})$/i;
const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const allowedRoles = new Set(["ADMIN", "USER"]);

export function safeEndpoint(req) {
  const routePath = req?.route?.path;
  if (typeof routePath === "string") return `${req.baseUrl || ""}${routePath}`.slice(0, 160);
  return req?.baseUrl || "/unmatched";
}

export function logSafe(level, event, context = {}) {
  if (!["info", "warn", "error"].includes(level)) return;
  const safeEvent = typeof event === "string" && /^[a-z0-9_.-]{1,80}$/i.test(event) ? event : "event";
  const record = { level, event: safeEvent };

  if (typeof context.requestId === "string" && requestIdPattern.test(context.requestId)) record.requestId = context.requestId;
  if (typeof context.endpoint === "string" && context.endpoint.startsWith("/") && !/[?#]/.test(context.endpoint)) record.endpoint = context.endpoint.slice(0, 160);
  if (typeof context.method === "string" && allowedMethods.has(context.method.toUpperCase())) record.method = context.method.toUpperCase();
  if (Number.isInteger(context.statusCode) && context.statusCode >= 100 && context.statusCode <= 599) record.statusCode = context.statusCode;
  if (Number.isFinite(context.durationMs) && context.durationMs >= 0) record.durationMs = Math.round(context.durationMs);
  if (context.userId !== undefined && context.userId !== null && /^\d+$/.test(String(context.userId))) record.userId = `***${String(context.userId).slice(-2)}`;
  if (typeof context.role === "string" && allowedRoles.has(context.role)) record.role = context.role;
  if (typeof context.diagnosticCode === "string" && diagnosticCodePattern.test(context.diagnosticCode)) record.diagnosticCode = context.diagnosticCode;

  console[level](JSON.stringify(record));
}