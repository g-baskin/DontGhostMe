import { database, syntheticOwnerId } from "@/application/server";
import { listClassificationProposals } from "@/db/classification";
import {
  CLASSIFICATION_PROPOSAL_TYPES,
  CLASSIFICATION_STATES,
  type ClassificationProposalType,
  type ClassificationState,
} from "@/domain/classification";
import { classificationErrorResponse, privateJson } from "../http";

export const runtime = "nodejs";

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const type = url.searchParams.get("type");
    const filters: { state?: ClassificationState; type?: ClassificationProposalType } = {};
    if (state) {
      if (!CLASSIFICATION_STATES.includes(state as ClassificationState))
        return privateJson({ error: { code: "invalid_filter" } }, { status: 400 });
      filters.state = state as ClassificationState;
    }
    if (type) {
      if (!CLASSIFICATION_PROPOSAL_TYPES.includes(type as ClassificationProposalType))
        return privateJson({ error: { code: "invalid_filter" } }, { status: 400 });
      filters.type = type as ClassificationProposalType;
    }
    return privateJson({
      proposals: listClassificationProposals(database, syntheticOwnerId, filters),
    });
  } catch (error) {
    return classificationErrorResponse(error);
  }
}
