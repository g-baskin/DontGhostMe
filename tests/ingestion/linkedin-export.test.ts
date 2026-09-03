import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HistoricalImportError } from "@/domain/imports";
import { inspectLinkedInExport } from "@/ingestion/linkedin-export";

const directories: string[] = [];
function fixture(name: string, content: string) {
  const directory = mkdtempSync(join(tmpdir(), "dontghostme-linkedin-"));
  directories.push(directory);
  const path = join(directory, "source");
  writeFileSync(path, content, { mode: 0o600 });
  return { path, name };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("official LinkedIn CSV ingestion", () => {
  it("previews without rows and creates stable, bounded normalized rows only when requested", async () => {
    const source = fixture(
      "Connections.csv",
      "First Name,Last Name,Connected On,Email Address\nAda,Lovelace,01 Sep 2026,ada@example.test\n",
    );
    const preview = await inspectLinkedInExport(source.path, source.name);
    expect(preview.inventory).toEqual([
      { datasetKind: "connections", recognized: true, rowCount: 1 },
    ]);
    expect(preview.rows).toEqual([]);
    const first = await inspectLinkedInExport(source.path, source.name, true);
    const second = await inspectLinkedInExport(source.path, source.name, true);
    expect(first.rows).toEqual(second.rows);
    expect(first.rows[0]?.normalized).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      connectedOn: "01 Sep 2026",
    });
  });

  it("fails recognized datasets closed on ambiguous or drifting headers", async () => {
    const source = fixture("Job Applications.csv", "Company,Title\nExample,Engineer\n");
    await expect(inspectLinkedInExport(source.path, source.name)).rejects.toMatchObject({
      code: "schema_drift",
    } satisfies Partial<HistoricalImportError>);
  });

  it("counts unknown CSV files without reading them as official datasets", async () => {
    const source = fixture("Unknown.csv", "A,B\n1,2\n");
    await expect(inspectLinkedInExport(source.path, source.name)).resolves.toEqual({
      inventory: [{ datasetKind: null, recognized: false, rowCount: 0 }],
      rows: [],
    });
  });
});
