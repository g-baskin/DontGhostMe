import type { OpportunityOutcome } from "./models";

export type ManualEntityKind =
  | "recruiter"
  | "recruiter_identity"
  | "recruiter_affiliation"
  | "organization"
  | "opportunity";

export type ManualFieldValue =
  | { entityKind: "recruiter"; fieldName: "canonical_name"; value: string }
  | {
      entityKind: "recruiter_identity";
      fieldName: "email" | "valid_from" | "valid_to";
      value: string | null;
    }
  | {
      entityKind: "recruiter_affiliation";
      fieldName: "organization_id" | "valid_from" | "valid_to";
      value: string | null;
    }
  | { entityKind: "organization"; fieldName: "display_name"; value: string }
  | {
      entityKind: "opportunity";
      fieldName:
        | "title"
        | "staffing_organization_id"
        | "end_client_organization_id"
        | "introduced_at"
        | "outcome_state";
      value: string | OpportunityOutcome | null;
    };

export type ManualAssertion = ManualFieldValue & {
  id: string;
  ownerId: string;
  entityId: string;
  sourceReferenceId: string;
  supersedesAssertionId: string | null;
  retractedAt: string | null;
  createdAt: string;
  revision: number;
};

export interface ManualCreationInput {
  kind: "recruiter" | "organization" | "opportunity";
  name?: string;
  email?: string;
  validFrom?: string;
  recruiterId?: string;
  staffingOrganizationId?: string;
  endClientOrganizationId?: string | null;
  title?: string;
  introducedAt?: string;
  outcome?: OpportunityOutcome;
}

export class ManualAssertionError extends Error {
  constructor(
    public readonly code: "invalid_input" | "not_found" | "revision_conflict" | "unsupported_field",
  ) {
    super(code);
    this.name = "ManualAssertionError";
  }
}
