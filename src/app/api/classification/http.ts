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
import { HistoricalImportError } from "@/domain/imports";
import { privateJson, readBoundedJson } from "../imports/http";

export { privateJson, readBoundedJson };

export function classificationErrorResponse(error: unknown) {
  const code =
    error instanceof ClassificationInputError ||
    error instanceof ClassificationDecisionConflict ||
    error instanceof ClassificationDependencyError ||
    error instanceof ClassificationProcessingError ||
    error instanceof ClassificationRunConflict ||
    error instanceof ClassificationNotFoundError
      ? error.message
      : error instanceof HistoricalImportError
        ? error.code
        : "classification_internal_error";
  const status =
    error instanceof ClassificationNotFoundError
      ? 404
      : error instanceof ClassificationProcessingError
        ? 500
        : error instanceof ClassificationDecisionConflict ||
            error instanceof ClassificationDependencyError ||
            error instanceof ClassificationRunConflict
          ? 409
          : code === "classification_internal_error"
            ? 500
            : 400;
  return privateJson({ error: { code } }, { status });
}
