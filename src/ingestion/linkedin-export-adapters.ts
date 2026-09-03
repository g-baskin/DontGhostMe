import { HistoricalImportError } from "@/domain/imports";

export type LinkedInDatasetKind = "connections" | "invitations" | "job_applications";

interface DatasetSchema {
  kind: LinkedInDatasetKind;
  names: string[];
  required: Record<string, string[]>;
}

export const LINKEDIN_SCHEMAS: DatasetSchema[] = [
  {
    kind: "connections",
    names: ["connections.csv"],
    required: {
      firstName: ["first name", "firstname"],
      lastName: ["last name", "lastname"],
      connectedOn: ["connected on", "connected date"],
    },
  },
  {
    kind: "invitations",
    names: ["invitations.csv"],
    required: {
      from: ["from"],
      to: ["to"],
      sentAt: ["sent at", "sent date"],
      direction: ["direction"],
    },
  },
  {
    kind: "job_applications",
    names: ["job applications.csv", "job_applications.csv"],
    required: {
      companyName: ["company name", "company"],
      jobTitle: ["job title", "title"],
      appliedDate: ["application date", "applied date", "date applied"],
    },
  },
];

const normalizedHeader = (value: string) => value.trim().toLocaleLowerCase("en-US");

export function schemaForFilename(filename: string) {
  const name = filename.split("/").at(-1)?.toLocaleLowerCase("en-US") ?? "";
  return LINKEDIN_SCHEMAS.find((schema) => schema.names.includes(name)) ?? null;
}

export function routeHeaders(schema: DatasetSchema, headers: string[]) {
  if (headers.length > 128 || new Set(headers.map(normalizedHeader)).size !== headers.length)
    throw new HistoricalImportError("schema_drift", false);
  const indexes: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(schema.required)) {
    const matches = headers
      .map(normalizedHeader)
      .map((header, index) => (aliases.includes(header) ? index : -1))
      .filter((index) => index >= 0);
    if (matches.length !== 1) throw new HistoricalImportError("schema_drift", false);
    indexes[field] = matches[0];
  }
  return indexes;
}

export function normalizeLinkedInRow(
  schema: DatasetSchema,
  indexes: Record<string, number>,
  row: string[],
) {
  if (row.length > 128) throw new HistoricalImportError("column_limit", false);
  const normalized: Record<string, string> = {};
  for (const [field, index] of Object.entries(indexes)) {
    const value = row[index]?.trim() ?? "";
    if (Buffer.byteLength(value) > 256 * 1024)
      throw new HistoricalImportError("field_limit", false);
    normalized[field] = value.slice(0, 1_000);
  }
  return { datasetKind: schema.kind, values: normalized };
}
