import { HistoricalImportError } from "@/domain/imports";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function assertLocalMutationRequest(request: Request) {
  const host = request.headers.get("host");
  if (!host) throw new HistoricalImportError("invalid_request", false);
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  if (!hostname || !LOCAL_HOSTS.has(hostname.toLowerCase()))
    throw new HistoricalImportError("invalid_request", false);

  const origin = request.headers.get("origin");
  if (!origin) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HistoricalImportError("invalid_request", false);
  }
  if (parsed.protocol !== "http:" || parsed.host.toLowerCase() !== host.toLowerCase())
    throw new HistoricalImportError("invalid_request", false);
}
