import type { MessageDirection } from "@/domain/models";

export interface SyntheticMessage {
  id: string;
  sourceKey: string;
  conversationKey: string;
  from: string;
  direction: MessageDirection;
  subject: string;
  occurredAt: string;
  body: string;
}

export const SYNTHETIC_OWNER_ID = "00000000-0000-4000-8000-000000000001";
export const JANE_RECRUITER_ID = "00000000-0000-4000-8000-000000000010";
export const PROPOSED_AFFILIATION_ASSERTION_ID = "00000000-0000-4000-8000-000000000090";

export const janeMessages: SyntheticMessage[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    sourceKey: "jane-01-introduction",
    conversationKey: "opportunity-a",
    from: "jane@oldagency.example",
    direction: "recruiter_to_candidate",
    subject: "Senior Platform Engineer at ExampleCo",
    occurredAt: "2025-01-06T15:00:00.000Z",
    body: "Hi Candidate, I am Jane at Old Agency. I have a Senior Platform Engineer role at ExampleCo.",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    sourceKey: "jane-02-candidate-reply",
    conversationKey: "opportunity-a",
    from: "candidate@local.example",
    direction: "candidate_to_recruiter",
    subject: "Re: Senior Platform Engineer at ExampleCo",
    occurredAt: "2025-01-06T16:00:00.000Z",
    body: "Thanks Jane. I am interested and would like to learn more.",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    sourceKey: "jane-03-resume-request",
    conversationKey: "opportunity-a",
    from: "jane@oldagency.example",
    direction: "recruiter_to_candidate",
    subject: "Resume request",
    occurredAt: "2025-01-07T14:00:00.000Z",
    body: "Please send your current resume for the ExampleCo role.",
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    sourceKey: "jane-04-resume-reply",
    conversationKey: "opportunity-a",
    from: "candidate@local.example",
    direction: "candidate_to_recruiter",
    subject: "Re: Resume request",
    occurredAt: "2025-01-07T14:30:00.000Z",
    body: "I have attached the synthetic resume for this fixture.",
  },
  {
    id: "00000000-0000-4000-8000-000000000105",
    sourceKey: "jane-05-rtr-request",
    conversationKey: "opportunity-a",
    from: "jane@oldagency.example",
    direction: "recruiter_to_candidate",
    subject: "Right to represent",
    occurredAt: "2025-01-08T13:00:00.000Z",
    body: "Please confirm Old Agency may represent you for this specific ExampleCo role.",
  },
  {
    id: "00000000-0000-4000-8000-000000000106",
    sourceKey: "jane-06-rtr-reply",
    conversationKey: "opportunity-a",
    from: "candidate@local.example",
    direction: "candidate_to_recruiter",
    subject: "Re: Right to represent",
    occurredAt: "2025-01-08T13:45:00.000Z",
    body: "Confirmed for this role only.",
  },
  {
    id: "00000000-0000-4000-8000-000000000107",
    sourceKey: "jane-07-submitted",
    conversationKey: "opportunity-a",
    from: "jane@oldagency.example",
    direction: "recruiter_to_candidate",
    subject: "Submitted to ExampleCo",
    occurredAt: "2025-01-09T17:00:00.000Z",
    body: "I submitted your profile to ExampleCo today.",
  },
  {
    id: "00000000-0000-4000-8000-000000000108",
    sourceKey: "jane-08-interview-follow-up",
    conversationKey: "opportunity-a",
    from: "jane@oldagency.example",
    direction: "recruiter_to_candidate",
    subject: "Interview availability",
    occurredAt: "2025-01-13T15:00:00.000Z",
    body: "Following up: ExampleCo requested interview availability. No later outcome is documented.",
  },
  {
    id: "00000000-0000-4000-8000-000000000109",
    sourceKey: "jane-09-new-agency",
    conversationKey: "opportunity-b",
    from: "jane@newagency.example",
    direction: "recruiter_to_candidate",
    subject: "Staff Engineer at Sample Labs",
    occurredAt: "2025-06-02T14:00:00.000Z",
    body: "A new Staff Engineer opportunity may fit. Regards, Jane, Principal Recruiter, New Agency.",
  },
];
