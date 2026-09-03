import { describe, expect, it } from "vitest";
import { classificationErrorResponse } from "@/app/api/classification/http";
import {
  ClassificationInputError,
  ClassificationNotFoundError,
  ClassificationProcessingError,
  ClassificationRunConflict,
} from "@/db/classification";
import {
  ClassificationDecisionConflict,
  ClassificationDependencyError,
} from "@/db/classification-decisions";

describe("classification API errors", () => {
  it.each([
    [new ClassificationInputError("owner_email_required"), 400, "owner_email_required"],
    [new ClassificationNotFoundError(), 404, "classification_not_found"],
    [new ClassificationDecisionConflict(), 409, "classification_revision_conflict"],
    [new ClassificationDependencyError(), 409, "classification_dependency_required"],
    [new ClassificationRunConflict(), 409, "classification_run_conflict"],
    [new ClassificationProcessingError(), 500, "classification_failed"],
  ])("returns allowlisted errors", async (error, status, code) => {
    const response = classificationErrorResponse(error);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code } });
  });

  it("redacts arbitrary errors", async () => {
    const response = classificationErrorResponse(new Error("message body and address"));
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("classification_internal_error");
    expect(
      await classificationErrorResponse(new Error("secret@example.test")).text(),
    ).not.toContain("secret@example.test");
  });
});
