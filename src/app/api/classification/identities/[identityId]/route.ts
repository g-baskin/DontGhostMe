import { assertLocalMutationRequest } from "@/application/local-request";
import { database, syntheticOwnerId } from "@/application/server";
import { deleteOwnerEmailIdentity, listOwnerEmailIdentities } from "@/db/classification";
import { classificationErrorResponse, privateJson } from "../../http";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ identityId: string }> },
) {
  try {
    assertLocalMutationRequest(request);
    const { identityId } = await context.params;
    deleteOwnerEmailIdentity(database, syntheticOwnerId, identityId);
    return privateJson({ identities: listOwnerEmailIdentities(database, syntheticOwnerId) });
  } catch (error) {
    return classificationErrorResponse(error);
  }
}
