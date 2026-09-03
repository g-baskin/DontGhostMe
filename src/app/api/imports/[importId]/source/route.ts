import { importErrorResponse, privateJson } from "@/app/api/imports/http";
import { failHistoricalImport, uploadHistoricalImport } from "@/application/historical-imports";
import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";
import { HistoricalImportError } from "@/domain/imports";

export const runtime = "nodejs";

type Context = { params: Promise<{ importId: string }> };

async function* requestChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

export async function PUT(request: Request, context: Context) {
  const { importId } = await context.params;
  try {
    assertLocalMutationRequest(request);
    if (request.headers.get("content-type") !== "application/mbox")
      throw new HistoricalImportError("invalid_request", false);
    const encodedName = request.headers.get("x-file-name");
    const sizeHeader = request.headers.get("x-file-size");
    if (!encodedName || !sizeHeader || !request.body)
      throw new HistoricalImportError("invalid_request", false);
    let originalName: string;
    try {
      originalName = decodeURIComponent(encodedName);
    } catch {
      throw new HistoricalImportError("invalid_filename", false);
    }
    const declaredSize = Number(sizeHeader);
    const summary = await uploadHistoricalImport(
      database,
      syntheticOwnerId,
      importId,
      originalName,
      declaredSize,
      requestChunks(request.body),
    );
    return privateJson({ import: summary });
  } catch (error) {
    if (error instanceof HistoricalImportError && error.code !== "invalid_id") {
      await failHistoricalImport(database, syntheticOwnerId, importId, error.code).catch(
        () => undefined,
      );
    }
    return importErrorResponse(error);
  }
}
