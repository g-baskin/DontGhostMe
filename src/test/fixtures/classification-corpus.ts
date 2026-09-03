import type { ClassificationMessage } from "@/domain/classification";

export interface LabeledClassificationMessage {
  message: ClassificationMessage;
  recruiter: boolean;
  submission: boolean;
}

const owner = { address: "candidate@example.test", name: "Casey Candidate" };

function message(
  id: string,
  from: { address: string; name?: string },
  subject: string,
  safeText: string,
  labels: Pick<LabeledClassificationMessage, "recruiter" | "submission">,
  overrides: Partial<ClassificationMessage> = {},
): LabeledClassificationMessage {
  return {
    ...labels,
    message: {
      id,
      sourceMessageId: `source-${id}`,
      sentAt: `2026-01-${id.padStart(2, "0")}T12:00:00.000Z`,
      subject,
      sender: [from],
      recipients: [owner],
      replyTo: [],
      normalizedMessageId: `<${id}@fixture.example>`,
      references: [],
      safeText,
      textTruncated: false,
      warningCodes: [],
      ...overrides,
    },
  };
}

export const ownerEmails = new Set([owner.address]);

export const classificationCorpus: LabeledClassificationMessage[] = [
  message(
    "1",
    { address: "jane@agency.example", name: "Jane Recruiter" },
    "Senior Platform Engineer role at ExampleCo",
    "I am a Technical Recruiter at Agency Group. I have a Senior Platform Engineer role at ExampleCo.",
    { recruiter: true, submission: false },
  ),
  message(
    "2",
    { address: "sam@company.example", name: "Sam Talent" },
    "Interview for Product Manager",
    "I work in Talent Acquisition at Company. Can we schedule an interview for our Product Manager position?",
    { recruiter: true, submission: false },
  ),
  message(
    "3",
    { address: "lee@staffing.example", name: "Lee Agent" },
    "Right-to-represent for Data Engineer",
    "As your Staffing Consultant at Staffing Partners, please review this right-to-represent for the Data Engineer role.",
    { recruiter: true, submission: false },
  ),
  message(
    "4",
    { address: "ana@agency.example", name: "Ana Recruiter" },
    "Staff Engineer update",
    "I am your recruiter. I submitted your profile to Sample Labs today for the Staff Engineer role.",
    { recruiter: true, submission: true },
  ),
  message(
    "5",
    { address: "morgan@search.example", name: "Morgan Search" },
    "Backend Developer opening",
    "Technical Recruiter | Search Team\nI have a Backend Developer opening for you.",
    { recruiter: true, submission: false },
  ),
  message(
    "6",
    { address: "jobs@alerts.example", name: "Job Alerts" },
    "New jobs for you",
    "Job alert: ten engineering roles match your preferences. Unsubscribe here.",
    { recruiter: false, submission: false },
  ),
  message(
    "7",
    { address: "no-reply@ats.example", name: "ATS" },
    "Application received",
    "Thank you for applying. Your application was received.",
    { recruiter: false, submission: false },
  ),
  message(
    "8",
    { address: "billing@shop.example", name: "Shop" },
    "Receipt",
    "Your payment confirmation and receipt are attached.",
    { recruiter: false, submission: false },
  ),
  message(
    "9",
    { address: "news@community.example", name: "Community" },
    "Weekly newsletter",
    "This newsletter includes community updates. Manage email preferences or unsubscribe.",
    { recruiter: false, submission: false },
  ),
  message(
    "10",
    { address: "calendar@calendar.example", name: "Calendar" },
    "Invitation: Engineering meetup",
    "Calendar invitation: Engineering meetup.",
    { recruiter: false, submission: false },
  ),
  message(
    "11",
    { address: "alex@one.example", name: "Alex Kim" },
    "Hello",
    "Hello Casey, nice to meet you.",
    { recruiter: false, submission: false },
  ),
  message(
    "12",
    { address: "alex@two.example", name: "Alex Kim" },
    "Following up",
    "Following up on our community conversation.",
    { recruiter: false, submission: false },
  ),
];
