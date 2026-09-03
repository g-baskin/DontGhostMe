import { assertLocalMutationRequest } from "@/application/local-request";
import { correctManualValue, createManualEntity } from "@/application/manual-corrections";
import { database, syntheticOwnerId } from "@/application/server";
import { listManualAssertions } from "@/db/manual-assertions";
import { ManualAssertionError } from "@/domain/manual-assertions";
import { privateJson, readBoundedJson } from "../imports/http";

export const runtime = "nodejs";

function response(error: unknown) {
  const code =
    error instanceof ManualAssertionError ? error.code : "manual_assertion_internal_error";
  const status =
    code === "not_found"
      ? 404
      : code === "revision_conflict"
        ? 409
        : code.endsWith("internal_error")
          ? 500
          : 400;
  return privateJson({ error: { code } }, { status });
}

export function GET(request: Request) {
  const entityId = new URL(request.url).searchParams.get("entityId");
  if (!entityId) return privateJson({ error: { code: "invalid_input" } }, { status: 400 });
  return privateJson({ assertions: listManualAssertions(database, syntheticOwnerId, entityId) });
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const body = await readBoundedJson(request);
    if (!body || typeof body !== "object") throw new ManualAssertionError("invalid_input");
    const input = body as Record<string, unknown>;
    if (input.action === "create")
      return privateJson(
        { entity: createManualEntity(database, syntheticOwnerId, input.entity) },
        { status: 201 },
      );
    if (input.action === "correct")
      return privateJson(
        {
          assertion: correctManualValue(
            database,
            syntheticOwnerId,
            String(input.entityId ?? ""),
            input.field,
            Number(input.expectedRevision),
          ),
        },
        { status: 201 },
      );
    throw new ManualAssertionError("invalid_input");
  } catch (error) {
    return response(error);
  }
}
