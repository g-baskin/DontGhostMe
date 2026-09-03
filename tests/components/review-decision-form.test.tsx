import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/review", () => ({
  submitReviewDecision: vi.fn(async () => ({ status: "success", message: "Saved" })),
}));

import { ReviewDecisionForm } from "@/components/review-decision-form";

describe("ReviewDecisionForm", () => {
  it("offers explicit, named confirm and reject actions", () => {
    const { container } = render(
      <ReviewDecisionForm assertionId="00000000-0000-4000-8000-000000000090" revision={0} />,
    );

    expect(screen.getByRole("button", { name: "Confirm fact" })).toHaveAttribute(
      "name",
      "decision",
    );
    expect(screen.getByRole("button", { name: "Reject fact" })).toHaveAttribute("name", "decision");
    expect(container.querySelector("[aria-live='polite']")).toBeInTheDocument();
  });
});
