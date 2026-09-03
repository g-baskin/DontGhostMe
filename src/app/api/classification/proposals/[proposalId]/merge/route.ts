import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";
import { decideClassificationProposal } from "@/db/classification-decisions";
import { classificationErrorResponse, privateJson, readBoundedJson } from "../../../http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  try {
    assertLocalMutationRequest(request);
    const { proposalId } = await context.params;
    const body = await readBoundedJson(request);
    const revision =
      body && typeof body === "object"
        ? (body as { expectedRevision?: unknown }).expectedRevision
        : null;
    if (!Number.isSafeInteger(revision) || (revision as number) < 0)
      return privateJson({ error: { code: "invalid_decision" } }, { status: 400 });
    return privateJson(
      decideClassificationProposal(database, syntheticOwnerId, proposalId, {
        decision: "merge",
        expectedRevision: revision as number,
      }),
    );
  } catch (error) {
    return classificationErrorResponse(error);
  }
}
