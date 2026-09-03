import { importErrorResponse, privateJson } from "@/app/api/imports/http";
import { deleteHistoricalImport, getHistoricalImport } from "@/application/historical-imports";
import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ importId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { importId } = await context.params;
    return privateJson({ import: getHistoricalImport(database, syntheticOwnerId, importId) });
  } catch (error) {
    return importErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertLocalMutationRequest(request);
    const { importId } = await context.params;
    await deleteHistoricalImport(database, syntheticOwnerId, importId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return importErrorResponse(error);
  }
}
