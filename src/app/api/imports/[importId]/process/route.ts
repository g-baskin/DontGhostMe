import { importErrorResponse, privateJson } from "@/app/api/imports/http";
import {
  failHistoricalImport,
  processHistoricalImportBatch,
} from "@/application/historical-imports";
import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";
import { HistoricalImportError } from "@/domain/imports";

export const runtime = "nodejs";
type Context = { params: Promise<{ importId: string }> };

export async function POST(request: Request, context: Context) {
  const { importId } = await context.params;
  try {
    assertLocalMutationRequest(request);
    return privateJson({
      import: await processHistoricalImportBatch(database, syntheticOwnerId, importId),
    });
  } catch (error) {
    if (
      error instanceof HistoricalImportError &&
      !error.recoverable &&
      !["invalid_id", "invalid_state"].includes(error.code)
    ) {
      await failHistoricalImport(database, syntheticOwnerId, importId, error.code).catch(
        () => undefined,
      );
    }
    return importErrorResponse(error);
  }
}
