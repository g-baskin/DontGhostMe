import { HistoricalImportError } from "@/domain/imports";

const MAX_JSON_BYTES = 4096;

export async function readBoundedJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_JSON_BYTES)
    throw new HistoricalImportError("invalid_request", false);
  if (!request.body) throw new HistoricalImportError("invalid_request", false);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BYTES) throw new HistoricalImportError("invalid_request", false);
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HistoricalImportError("invalid_request", false);
  }
}

export function importErrorResponse(error: unknown) {
  const failure =
    error instanceof HistoricalImportError
      ? error
      : new HistoricalImportError("internal_error", false);
  const status =
    failure.code === "invalid_id"
      ? 404
      : failure.code === "invalid_state" || failure.code === "message_id_conflict"
        ? 409
        : failure.code === "internal_error"
          ? 500
          : 400;
  return Response.json(
    { error: { code: failure.code, recoverable: failure.recoverable } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function privateJson(value: unknown, init?: ResponseInit) {
  return Response.json(value, {
    ...init,
    headers: {
      ...init?.headers,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
