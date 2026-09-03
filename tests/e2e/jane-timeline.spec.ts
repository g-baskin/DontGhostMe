import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const janePath = "/recruiters/00000000-0000-4000-8000-000000000010";

async function expectNoAxeViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("Jane's complete evidence and correction flow", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your recruiting history, with receipts." }),
  ).toBeVisible();
  await expect(page.getByText("Recruiter messages").locator("..").locator("dd")).toHaveText("6");
  await page.getByRole("link", { name: "Open Jane Recruiter's evidence timeline" }).click();
  await expect(page).toHaveURL(janePath);
  await expect(page.getByRole("heading", { name: "Evidence chronology" })).toBeVisible();
  await page.getByText("Inspect source evidence").first().click();
  await expect(page.getByText("jane-01-introduction")).toBeVisible();

  await page.getByRole("link", { name: "Opportunities" }).click();
  await expect(page.getByText("Explicitly submitted")).toHaveCount(1);
  await expect(page.getByText("Unknown outcome")).toHaveCount(1);

  await page.getByRole("link", { name: "Review Queue" }).click();
  await page.getByRole("button", { name: "Confirm fact" }).click();
  await expect(page.getByText("Fact confirmed and history preserved.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("State: confirmed")).toBeVisible();
  await page.goto(janePath);
  await expect(page.getByText(/Accepted affiliation:/)).toContainText("New Agency");

  await page.goto("/review-queue");
  await page.getByRole("button", { name: "Reject fact" }).click();
  await expect(page.getByText("Fact rejected and source preserved.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("State: rejected")).toBeVisible();
  await expect(page.getByText("Jane, Principal Recruiter, New Agency")).toBeVisible();
});

test("all routes have no configured axe violations", async ({ page }) => {
  for (const path of [
    "/",
    "/recruiters",
    janePath,
    "/opportunities",
    "/review-queue",
    "/data-privacy",
  ]) {
    await page.goto(path);
    await expectNoAxeViolations(page);
  }
});

test("the primary flow reflows at 320 CSS pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of ["/", janePath, "/review-queue", "/data-privacy"]) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test("keyboard, text spacing, reduced motion, and forced colors preserve the flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto(janePath);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.getByText("Inspect source evidence").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("jane-01-introduction")).toBeVisible();
  await page.setViewportSize({ width: 640, height: 800 });
  await page.addStyleTag({
    content:
      "html{font-size:200%}*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}",
  });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    forced: matchMedia("(forced-colors: active)").matches,
  }));
  expect(dimensions).toMatchObject({ reduced: true, forced: true });
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test("portable export contains provenance without local paths", async ({ request }) => {
  const response = await request.get("/api/export");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-disposition"]).toContain("dontghostme-synthetic-export.json");
  const body = await response.json();
  expect(body.communications).toHaveLength(9);
  expect(body.evidence).toHaveLength(5);
  expect(JSON.stringify(body)).not.toContain(".sqlite");
});
