import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";
import { processClassificationBatch } from "@/db/classification";
import { classificationErrorResponse, privateJson } from "../../../http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    assertLocalMutationRequest(request);
    const { runId } = await context.params;
    return privateJson({ run: processClassificationBatch(database, syntheticOwnerId, runId) });
  } catch (error) {
    return classificationErrorResponse(error);
  }
}
