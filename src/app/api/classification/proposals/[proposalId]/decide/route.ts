import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";
import { decideClassificationProposal } from "@/db/classification-decisions";
import {
  CLASSIFICATION_DECISIONS,
  type ClassificationDecision,
  type ProposedValue,
} from "@/domain/classification";
import { classificationErrorResponse, privateJson, readBoundedJson } from "../../../http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  try {
    assertLocalMutationRequest(request);
    const { proposalId } = await context.params;
    const body = await readBoundedJson(request);
    if (!body || typeof body !== "object")
      return privateJson({ error: { code: "invalid_decision" } }, { status: 400 });
    const input = body as {
      decision?: unknown;
      expectedRevision?: unknown;
      correctedValue?: unknown;
    };
    if (
      typeof input.decision !== "string" ||
      !CLASSIFICATION_DECISIONS.includes(input.decision as ClassificationDecision) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      (input.expectedRevision as number) < 0
    )
      return privateJson({ error: { code: "invalid_decision" } }, { status: 400 });
    const result = decideClassificationProposal(database, syntheticOwnerId, proposalId, {
      decision: input.decision as ClassificationDecision,
      expectedRevision: input.expectedRevision as number,
      correctedValue: input.correctedValue as ProposedValue | undefined,
    });
    return privateJson(result);
  } catch (error) {
    return classificationErrorResponse(error);
  }
}
