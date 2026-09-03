import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const janePath = "/recruiters/00000000-0000-4000-8000-000000000010";

async function expectNoSeriousAxeViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
  ).toEqual([]);
}

test("relationship filters, status, exclusion, and restore work", async ({ page }) => {
  await page.goto("/recruiters");
  await page
    .getByRole("searchbox", { name: "Search names, emails, or accepted companies" })
    .fill("old agency");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: "Jane Recruiter" })).toBeVisible();
  await page.getByRole("link", { name: "Jane Recruiter" }).click();
  await page.getByLabel("Relationship status").selectOption("dormant");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText("Relationship status saved.")).toBeVisible();
  await page.getByRole("button", { name: "Exclude recruiter" }).click();
  await expect(page.getByRole("button", { name: "Restore recruiter" })).toBeVisible();
  await page.goto("/recruiters?excluded=1");
  await page.getByRole("link", { name: "Jane Recruiter" }).click();
  await expect(page.getByLabel("Relationship status")).toHaveValue("dormant");
  await page.getByRole("button", { name: "Restore recruiter" }).click();
  await expect(page.getByRole("button", { name: "Exclude recruiter" })).toBeVisible();
});

test("opportunity stages link to evidence details", async ({ page }) => {
  await page.goto("/opportunities");
  const opportunity = page.locator(".record h2 a").first();
  await opportunity.click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Evidence-backed stage history" })).toBeVisible({
    timeout: 15_000,
  });
  await expectNoSeriousAxeViolations(page);
});

test("changed relationship pages have no serious or critical axe violations", async ({ page }) => {
  for (const path of ["/", "/recruiters", janePath, "/opportunities", "/data-privacy"]) {
    await page.goto(path);
    await expectNoSeriousAxeViolations(page);
  }
});

test("recruiter deletion requires confirmation and preserves source export", async ({
  page,
  request,
}) => {
  await page.goto(`${janePath}/delete`);
  await page.getByLabel(/Type DELETE RECRUITER DATA/).fill("delete");
  await page.getByRole("button", { name: "Delete recruiter-derived data" }).click();
  await expect(page.getByText(/Type DELETE RECRUITER DATA exactly/)).toBeVisible();
  await page.getByLabel(/Type DELETE RECRUITER DATA/).fill("DELETE RECRUITER DATA");
  await page.getByRole("button", { name: "Delete recruiter-derived data" }).click();
  await expect(page).toHaveURL(/\/data-privacy\?deleted=1$/, { timeout: 20_000 });
  await expect(page.getByText(/Recruiter-derived data deleted/)).toBeVisible();
  const exported = await (await request.get("/api/export")).json();
  expect(exported.sourceReferences).toHaveLength(9);
  expect(exported.recruiters).toHaveLength(0);
  expect(exported.recruiterDeletions).toHaveLength(1);
});
