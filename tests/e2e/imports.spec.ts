import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixture = "src/test/fixtures/takeout-small.mbox";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/imports");
  const body = (await response.json()) as { imports: Array<{ id: string; displayName: string }> };
  for (const item of body.imports.filter(
    ({ displayName }) => displayName === "takeout-small.mbox",
  )) {
    await request.delete(`/api/imports/${item.id}`);
  }
});

async function removeVisibleImport(page: import("@playwright/test").Page) {
  const details = page.getByText("Delete import history").first();
  await details.click();
  await page.getByRole("button", { name: "Delete this import record" }).first().click();
  await expect(
    page.getByText("Import history and its normalized messages were removed"),
  ).toBeVisible();
}

test("previews, confirms, imports, reports counts, and deletes local history", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "Imports", level: 1 })).toBeVisible();
  await expect(
    page.getByText(/does not connect to, modify, label, archive, or send/),
  ).toBeVisible();

  await page.getByLabel("Local MBOX file").setInputFiles(fixture);
  await page.getByRole("button", { name: "Upload and preview" }).click();
  await expect(
    page.getByText("Preview ready. Confirm before normalized messages are written."),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Found 2 messages\. 0 exceed a limit/)).toBeVisible();
  const history = page.locator(".import-record").first();
  await expect(history.getByText("Discovered").locator("..").getByText("2")).toBeVisible();
  await expect(history.getByText("Imported").locator("..").getByText("0")).toBeVisible();

  const previewResults = await new AxeBuilder({ page }).analyze();
  expect(previewResults.violations).toEqual([]);

  await page.getByRole("button", { name: "Confirm and import" }).click();
  await expect(
    page.getByText("Import complete. The temporary source file was deleted."),
  ).toBeVisible();
  await expect(history.getByText("Parsed").locator("..").getByText("2")).toBeVisible();
  await expect(history.getByText("Imported").locator("..").getByText("2")).toBeVisible();
  await expect(history.getByText("Temporary source file deleted")).toBeVisible();

  await removeVisibleImport(page);
});

test("cancel, status, and resume operations preserve the checkpoint", async ({ request }) => {
  const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(fixture));
  const createdResponse = await request.post("/api/imports", {
    data: { name: "takeout-small.mbox", size: bytes.length },
  });
  const created = (await createdResponse.json()) as { import: { id: string } };
  const headers = {
    "Content-Type": "application/mbox",
    "X-File-Name": encodeURIComponent("takeout-small.mbox"),
    "X-File-Size": String(bytes.length),
  };
  expect(
    (await request.put(`/api/imports/${created.import.id}/source`, { data: bytes, headers })).ok(),
  ).toBe(true);
  expect((await request.post(`/api/imports/${created.import.id}/preview`)).ok()).toBe(true);
  const paused = await request.post(`/api/imports/${created.import.id}/cancel`);
  expect((await paused.json()).import.status).toBe("paused_user");
  const status = await request.get(`/api/imports/${created.import.id}`);
  expect((await status.json()).import.status).toBe("paused_user");
  const resumed = await request.post(`/api/imports/${created.import.id}/resume`);
  expect((await resumed.json()).import.status).toBe("completed");
  expect((await request.delete(`/api/imports/${created.import.id}`)).status()).toBe(204);
});

test("imports page remains keyboard-operable and reflows at narrow zoom-equivalent width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/imports");
  await page.addStyleTag({
    content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }`,
  });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "DontGhostMe" })).toBeFocused();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
