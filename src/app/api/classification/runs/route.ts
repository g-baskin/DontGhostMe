import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";
import { listClassificationRuns, startClassificationRun } from "@/db/classification";
import { classificationErrorResponse, privateJson } from "../http";

export const runtime = "nodejs";

export function GET() {
  try {
    return privateJson({ runs: listClassificationRuns(database, syntheticOwnerId) });
  } catch (error) {
    return classificationErrorResponse(error);
  }
}

export function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return privateJson(
      { run: startClassificationRun(database, syntheticOwnerId) },
      { status: 201 },
    );
  } catch (error) {
    return classificationErrorResponse(error);
  }
}
