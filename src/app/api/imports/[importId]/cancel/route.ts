import { importErrorResponse, privateJson } from "@/app/api/imports/http";
import { pauseHistoricalImport } from "@/application/historical-imports";
import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ importId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertLocalMutationRequest(request);
    const { importId } = await context.params;
    return privateJson({
      import: pauseHistoricalImport(database, syntheticOwnerId, importId),
    });
  } catch (error) {
    return importErrorResponse(error);
  }
}
