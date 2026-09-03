import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";
import {
  addOwnerEmailIdentity,
  ClassificationInputError,
  listOwnerEmailIdentities,
} from "@/db/classification";
import { classificationErrorResponse, privateJson, readBoundedJson } from "../http";

export const runtime = "nodejs";

export function GET() {
  try {
    return privateJson({ identities: listOwnerEmailIdentities(database, syntheticOwnerId) });
  } catch (error) {
    return classificationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const body = await readBoundedJson(request);
    const email = body && typeof body === "object" ? (body as { email?: unknown }).email : null;
    if (typeof email !== "string") throw new ClassificationInputError("invalid_owner_email");
    return privateJson(
      { identity: addOwnerEmailIdentity(database, syntheticOwnerId, email) },
      { status: 201 },
    );
  } catch (error) {
    return classificationErrorResponse(error);
  }
}
