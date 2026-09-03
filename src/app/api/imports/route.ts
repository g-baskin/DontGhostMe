import { importErrorResponse, privateJson, readBoundedJson } from "@/app/api/imports/http";
import {
  beginHistoricalImport,
  cleanupExpiredImports,
  listHistoricalImports,
} from "@/application/historical-imports";
import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";
import { HistoricalImportError } from "@/domain/imports";

export const runtime = "nodejs";

export async function GET() {
  try {
    await cleanupExpiredImports(database, syntheticOwnerId);
    return privateJson({ imports: listHistoricalImports(database, syntheticOwnerId) });
  } catch (error) {
    return importErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    await cleanupExpiredImports(database, syntheticOwnerId);
    const body = await readBoundedJson(request);
    if (!body || typeof body !== "object")
      throw new HistoricalImportError("invalid_request", false);
    const { name, size } = body as { name?: unknown; size?: unknown };
    if (typeof name !== "string" || typeof size !== "number")
      throw new HistoricalImportError("invalid_request", false);
    const id = beginHistoricalImport(database, syntheticOwnerId, name, size);
    return privateJson(
      { import: listHistoricalImports(database, syntheticOwnerId).find((item) => item.id === id) },
      { status: 201 },
    );
  } catch (error) {
    return importErrorResponse(error);
  }
}
