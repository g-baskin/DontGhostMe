import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { frameMbox } from "@/ingestion/mbox-framer";

const roots: string[] = [];

async function temporaryMbox(content: string | Buffer) {
  const root = await mkdtemp(join(tmpdir(), "dontghostme-mbox-"));
  roots.push(root);
  const path = join(root, "fixture.mbox");
  await writeFile(path, content);
  return path;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("frameMbox", () => {
  it.each([1, 2, 7, 64])("frames LF input across %i-byte chunks", async (chunkBytes) => {
    const source = await readFile("src/test/fixtures/takeout-small.mbox");
    const messages = [];
    for await (const message of frameMbox(await temporaryMbox(source), 0, 1024 * 1024, chunkBytes))
      messages.push(message);

    expect(messages).toHaveLength(2);
    expect(Buffer.from(messages[1]?.raw ?? []).toString("utf8")).toContain(
      ">From this line is escaped MBOX content",
    );
    expect(messages[0]?.nextOffset).toBe(
      messages[1]?.byteOffset -
        Buffer.byteLength("From candidate@example.test Tue Jan  7 09:00:00 2025\n"),
    );
  });

  it("frames CRLF and resumes exactly at the committed delimiter", async () => {
    const source = (await readFile("src/test/fixtures/takeout-small.mbox", "utf8")).replaceAll(
      "\n",
      "\r\n",
    );
    const path = await temporaryMbox(source);
    const firstPass = [];
    for await (const message of frameMbox(path, 0, 1024 * 1024, 3)) firstPass.push(message);
    const resumed = [];
    for await (const message of frameMbox(path, firstPass[0]?.nextOffset, 1024 * 1024, 5))
      resumed.push(message);

    expect(firstPass).toHaveLength(2);
    expect(resumed).toHaveLength(1);
    expect(Buffer.from(resumed[0]?.raw ?? []).toString("utf8")).toContain(
      "Message-ID: <reply-1@example.test>",
    );
  });

  it("accepts the exact message-byte boundary and rejects one byte over", async () => {
    const path = await temporaryMbox(
      "From sender@example.test Mon Jan  6 10:00:00 2025\nSubject: Boundary\n\nbody",
    );
    const baseline = [];
    for await (const item of frameMbox(path)) baseline.push(item);
    const messageBytes = baseline[0]?.byteLength ?? 0;
    const accepted = [];
    for await (const item of frameMbox(path, 0, messageBytes, 3)) accepted.push(item);
    const rejected = [];
    for await (const item of frameMbox(path, 0, messageBytes - 1, 3)) rejected.push(item);

    expect(accepted[0]).toMatchObject({ oversized: false, byteLength: messageBytes });
    expect(rejected[0]).toMatchObject({ oversized: true, byteLength: messageBytes });
    expect(rejected[0]?.raw).toHaveLength(0);
  });

  it("marks an oversized message without retaining its bytes", async () => {
    const path = await temporaryMbox(
      `From sender@example.test Mon Jan  6 10:00:00 2025\nSubject: Big\n\n${"x".repeat(80)}`,
    );
    const messages = [];
    for await (const message of frameMbox(path, 0, 64, 2)) messages.push(message);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ oversized: true, byteLength: 94 });
    expect(messages[0]?.raw).toHaveLength(0);
  });

  it("rejects a non-MBOX source", async () => {
    const path = await temporaryMbox("not an mbox");
    await expect(async () => {
      for await (const _message of frameMbox(path)) void _message;
    }).rejects.toMatchObject({ code: "invalid_mbox" });
  });
});
