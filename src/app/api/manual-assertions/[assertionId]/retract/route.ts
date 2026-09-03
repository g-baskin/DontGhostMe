import { assertLocalMutationRequest } from "@/application/local-request";
import { retractManualValue } from "@/application/manual-corrections";
import { database, syntheticOwnerId } from "@/application/server";
import { ManualAssertionError } from "@/domain/manual-assertions";
import { privateJson, readBoundedJson } from "../../../imports/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ assertionId: string }> },
) {
  try {
    assertLocalMutationRequest(request);
    const body = await readBoundedJson(request);
    const expectedRevision =
      body && typeof body === "object"
        ? Number((body as { expectedRevision?: unknown }).expectedRevision)
        : Number.NaN;
    const { assertionId } = await context.params;
    return privateJson({
      assertion: retractManualValue(database, syntheticOwnerId, assertionId, expectedRevision),
    });
  } catch (error) {
    const code =
      error instanceof ManualAssertionError ? error.code : "manual_assertion_internal_error";
    return privateJson(
      { error: { code } },
      {
        status:
          code === "not_found"
            ? 404
            : code === "revision_conflict"
              ? 409
              : code.endsWith("internal_error")
                ? 500
                : 400,
      },
    );
  }
}
