import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMimeBounded } from "@/ingestion/mime-parser";

const spies: Array<ReturnType<typeof vi.spyOn>> = [];

afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});

describe("import privacy", () => {
  it("does not write malformed message content to console output or errors", async () => {
    const secret = "fictional-secret-body@example.test";
    for (const method of ["log", "warn", "error"] as const) {
      spies.push(vi.spyOn(console, method).mockImplementation(() => undefined));
    }

    const error = await parseMimeBounded(
      Buffer.from(`From: sender@example.test\nSubject: ${secret}\nmissing-header-boundary`),
    ).catch((failure: unknown) => failure);

    expect(error).toMatchObject({ code: "header_limit", message: "header_limit" });
    expect(JSON.stringify(error)).not.toContain(secret);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
