import { describe, expect, it } from "vitest";
import { normalizeSyntheticMessages } from "@/ingestion/synthetic-normalizer";
import { janeMessages } from "@/test/fixtures/jane-conversation";

describe("normalizeSyntheticMessages", () => {
  it("keeps identities and opportunities separate while preserving provenance", () => {
    const fixture = normalizeSyntheticMessages(janeMessages);

    expect(fixture.identities.map(({ normalizedEmail }) => normalizedEmail)).toEqual([
      "jane@oldagency.example",
      "jane@newagency.example",
    ]);
    expect(fixture.opportunities).toHaveLength(2);
    expect(fixture.submissions).toHaveLength(1);
    expect(fixture.sources).toHaveLength(9);
    expect(new Set(fixture.sources.map(({ contentSha256 }) => contentSha256)).size).toBe(9);
    expect(fixture.assertions.find(({ factType }) => factType === "identity_link")?.inferred).toBe(
      false,
    );
  });

  it("does not treat resume or right-to-represent requests as submissions", () => {
    const fixture = normalizeSyntheticMessages(janeMessages);
    const submission = fixture.submissions[0];
    expect(submission.submittedAt).toBe(janeMessages[6].occurredAt);
  });
});
