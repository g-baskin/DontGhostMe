import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IMPORT_LIMITS } from "@/ingestion/import-limits";
import { stageMbox, validateMboxSelection } from "@/ingestion/staging";

const roots: string[] = [];
const importId = "10000000-0000-4000-8000-000000000001";

async function root() {
  const path = await mkdtemp(join(tmpdir(), "dontghostme-stage-"));
  roots.push(path);
  return path;
}

async function* chunks(...values: Uint8Array[]) {
  yield* values;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("bounded MBOX staging", () => {
  it("ignores traversal paths, hashes actual bytes, and uses restrictive permissions", async () => {
    const stagingRoot = await root();
    const bytes = Buffer.from(
      "From sender@example.test Mon Jan  6 10:00:00 2025\nSubject: Safe\n\nBody\n",
    );
    const staged = await stageMbox(
      importId,
      "../../bad\u0000name.mbox",
      bytes.length,
      chunks(bytes.subarray(0, 3), bytes.subarray(3)),
      stagingRoot,
    );

    expect(staged.displayName).toBe("badname.mbox");
    expect(staged.path).toBe(join(stagingRoot, importId, "source.mbox"));
    expect(await readFile(staged.path)).toEqual(bytes);
    expect((await stat(staged.path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(stagingRoot, importId))).mode & 0o777).toBe(0o700);
  });

  it.each([
    ["archive.zip", Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    ["archive.mbox", Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    ["archive.mbox", Buffer.from([0x1f, 0x8b, 0x08])],
    ["archive.mbox", Buffer.concat([Buffer.alloc(257), Buffer.from("ustar")])],
  ])("rejects archive extension or magic for %s", async (name, bytes) => {
    await expect(
      stageMbox(importId, name, bytes.length, chunks(bytes), await root()),
    ).rejects.toMatchObject({ code: "unsupported_archive" });
  });

  it("enforces the actual-byte boundary independently of the declared size", async () => {
    const bytes = Buffer.from("12345");
    const acceptedRoot = await root();
    await expect(
      stageMbox(importId, "mail.mbox", bytes.length, chunks(bytes), acceptedRoot, bytes.length),
    ).resolves.toMatchObject({ sourceSizeBytes: bytes.length });

    await expect(
      stageMbox(importId, "mail.mbox", bytes.length, chunks(bytes), await root(), bytes.length - 1),
    ).rejects.toMatchObject({ code: "source_too_large", message: "source_too_large" });
  });

  it("rejects TAR magic split across tiny upload chunks", async () => {
    const bytes = Buffer.concat([Buffer.alloc(257), Buffer.from("ustar")]);
    await expect(
      stageMbox(
        importId,
        "mail.mbox",
        bytes.length,
        chunks(...Array.from(bytes, (byte) => Uint8Array.of(byte))),
        await root(),
      ),
    ).rejects.toMatchObject({ code: "unsupported_archive", message: "unsupported_archive" });
  });

  it("requires an MBOX extension and a truthful byte count", async () => {
    expect(validateMboxSelection("mail.mbox", IMPORT_LIMITS.sourceBytes)).toBe("mail.mbox");
    expect(() => validateMboxSelection("mail.mbox", IMPORT_LIMITS.sourceBytes + 1)).toThrowError(
      expect.objectContaining({ code: "source_too_large", message: "source_too_large" }),
    );
    expect(() => validateMboxSelection("mail.txt", 10)).toThrowError(
      expect.objectContaining({ code: "invalid_filename" }),
    );
    const bytes = Buffer.from("From x@example.test Mon Jan  6 10:00:00 2025\n\n");
    await expect(
      stageMbox(importId, "mail.mbox", bytes.length + 1, chunks(bytes), await root()),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});
