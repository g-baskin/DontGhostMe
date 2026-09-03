"use client";

import { useRef, useState } from "react";
import type { HistoricalImportSummary } from "@/domain/imports";

const errorLabels: Record<string, string> = {
  invalid_filename: "Choose an extracted file ending in .mbox.",
  unsupported_archive:
    "Archives are not accepted. Extract the Takeout archive, then choose its MBOX.",
  source_too_large: "The selected MBOX exceeds the 2 GiB limit.",
  source_missing: "The temporary source is missing or changed. Start a new import.",
  source_expired: "The temporary source expired. Start a new import.",
  invalid_mbox: "This file is not a supported MBOX.",
  database_busy: "The local database is busy. Try resuming shortly.",
  invalid_state: "This import changed state. Refresh its status and try again.",
  internal_error: "The import could not continue. No source content was logged.",
  encrypted_archive: "Encrypted ZIP files are not accepted.",
  archive_entry_limit: "The ZIP contains too many entries.",
  archive_size_limit: "The expanded ZIP exceeds the local safety limit.",
  archive_ratio_limit: "The ZIP compression ratio exceeds the safety limit.",
  archive_path_invalid: "The ZIP contains an unsafe or duplicate path.",
  nested_archive: "Nested archives are not accepted.",
  malformed_csv: "A recognized CSV is malformed.",
  schema_drift: "A recognized CSV has unknown or ambiguous headers.",
  row_limit: "The export contains too many rows.",
  column_limit: "A CSV row contains too many columns.",
  field_limit: "A CSV field exceeds the safety limit.",
};

type ApiResult = { import: HistoricalImportSummary };

async function requestImport(url: string, method = "POST") {
  const response = await fetch(url, { method, headers: { Accept: "application/json" } });
  const body = (await response.json()) as
    | ApiResult
    | { error?: { code?: string; recoverable?: boolean } };
  if (!response.ok || !("import" in body)) {
    const code = "error" in body && body.error?.code ? body.error.code : "internal_error";
    throw new Error(code);
  }
  return body.import;
}

function uploadFile(
  importId: string,
  file: File,
  sourceKind: "gmail_mbox" | "linkedin_export",
  onProgress: (percent: number) => void,
) {
  return new Promise<HistoricalImportSummary>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", `/api/imports/${importId}/source`);
    request.setRequestHeader(
      "Content-Type",
      sourceKind === "gmail_mbox"
        ? "application/mbox"
        : file.name.toLocaleLowerCase("en-US").endsWith(".zip")
          ? "application/zip"
          : "text/csv",
    );
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader("X-File-Size", String(file.size));
    request.setRequestHeader("Accept", "application/json");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      try {
        const body = JSON.parse(request.responseText) as ApiResult | { error?: { code?: string } };
        if (request.status < 200 || request.status >= 300 || !("import" in body)) {
          reject(
            new Error("error" in body && body.error?.code ? body.error.code : "internal_error"),
          );
          return;
        }
        resolve(body.import);
      } catch {
        reject(new Error("internal_error"));
      }
    });
    request.addEventListener("error", () => reject(new Error("internal_error")));
    request.send(file);
  });
}

function processingPercent(item: HistoricalImportSummary) {
  if (item.discovered === 0) return 0;
  return Math.min(
    100,
    Math.round(((item.parsed + item.failed + item.skipped) / item.discovered) * 100),
  );
}

export function ImportWorkspace({ initialImports }: { initialImports: HistoricalImportSummary[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState<"gmail_mbox" | "linkedin_export">("gmail_mbox");
  const [imports, setImports] = useState(initialImports);
  const [active, setActive] = useState<HistoricalImportSummary | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [pending, setPending] = useState<"upload" | "preview" | "process" | "action" | null>(null);
  const [message, setMessage] = useState("");
  const cancelRequested = useRef(false);

  const replaceImport = (next: HistoricalImportSummary) => {
    setActive(next);
    setImports((current) => [next, ...current.filter((item) => item.id !== next.id)]);
  };

  const showError = (error: unknown) => {
    const code = error instanceof Error ? error.message : "internal_error";
    setMessage(
      `${errorLabels[code] ?? errorLabels.internal_error} ${code === "database_busy" ? "Recoverable error." : "Terminal error."}`,
    );
  };

  const uploadAndPreview = async () => {
    if (!file) return;
    setPending("upload");
    setMessage("Creating a private local import record.");
    setUploadPercent(0);
    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, sourceKind }),
      });
      const created = (await response.json()) as ApiResult | { error?: { code?: string } };
      if (!response.ok || !("import" in created))
        throw new Error(
          "error" in created && created.error?.code ? created.error.code : "internal_error",
        );
      replaceImport(created.import);
      const uploaded = await uploadFile(created.import.id, file, sourceKind, setUploadPercent);
      replaceImport(uploaded);
      setPending("preview");
      setMessage("Reading source boundaries for preview. No domain records are being written.");
      const previewed = await requestImport(`/api/imports/${uploaded.id}/preview`);
      replaceImport(previewed);
      setMessage(
        sourceKind === "gmail_mbox"
          ? "Preview ready. Confirm before normalized messages are written."
          : "Preview ready. Confirm before review proposals are written.",
      );
    } catch (error) {
      showError(error);
    } finally {
      setPending(null);
    }
  };

  const process = async (item: HistoricalImportSummary) => {
    setPending("process");
    setMessage("Importing bounded local batches.");
    cancelRequested.current = false;
    try {
      let current = item;
      do {
        current = await requestImport(`/api/imports/${current.id}/process`);
        replaceImport(current);
      } while (current.status === "processing" && !cancelRequested.current);
      if (current.status === "completed")
        setMessage("Import complete. The temporary source file was deleted.");
      else if (current.status === "paused_user")
        setMessage(
          "Import paused at its last committed checkpoint. It can be resumed for 24 hours.",
        );
    } catch (error) {
      showError(error);
    } finally {
      setPending(null);
    }
  };

  const cancel = async (item: HistoricalImportSummary) => {
    cancelRequested.current = true;
    setPending("action");
    try {
      const paused = await requestImport(`/api/imports/${item.id}/cancel`);
      replaceImport(paused);
      setMessage("Import paused at a safe checkpoint.");
    } catch (error) {
      showError(error);
    } finally {
      setPending(null);
    }
  };

  const remove = async (item: HistoricalImportSummary) => {
    setPending("action");
    try {
      const response = await fetch(`/api/imports/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("internal_error");
      setImports((current) => current.filter((entry) => entry.id !== item.id));
      if (active?.id === item.id) setActive(null);
      setMessage("Import history and its normalized messages were removed from local data.");
    } catch (error) {
      showError(error);
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <section className="section reading-width" aria-labelledby="select-import">
        <h2 className="section-heading" id="select-import">
          Select a local source
        </h2>
        <p>
          Choose an extracted Gmail MBOX, or your official LinkedIn ZIP/recognized CSV. LinkedIn
          connections and invitations are clues; job applications prove only an application record.
        </p>
        <div className="notice">
          Import reads a temporary local copy. It does not connect to, modify, label, archive, or
          send anything through Gmail.
        </div>
        <ul>
          <li>Maximum MBOX: 2 GiB. Maximum LinkedIn upload: 250 MiB.</li>
          <li>Maximum message: 25 MiB. Maximum attachment metadata item: 10 MiB decoded.</li>
          <li>Attachment content is never opened or separately stored.</li>
          <li>Temporary source bytes are deleted after completion or within 24 hours.</li>
        </ul>
        <div className="import-controls">
          <label htmlFor="source-kind">Source type</label>
          <select
            id="source-kind"
            value={sourceKind}
            onChange={(event) => {
              setSourceKind(event.currentTarget.value as "gmail_mbox" | "linkedin_export");
              setFile(null);
            }}
          >
            <option value="gmail_mbox">Gmail Takeout MBOX</option>
            <option value="linkedin_export">Official LinkedIn export</option>
          </select>
          <label htmlFor="mbox-file">
            {sourceKind === "gmail_mbox" ? "Local MBOX file" : "Official LinkedIn ZIP or CSV"}
          </label>
          <input
            accept={
              sourceKind === "gmail_mbox"
                ? ".mbox,application/mbox"
                : ".zip,.csv,application/zip,text/csv"
            }
            id="mbox-file"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setMessage("");
            }}
            type="file"
          />
          <button disabled={!file || pending !== null} onClick={uploadAndPreview} type="button">
            Upload and preview
          </button>
        </div>
        {pending === "upload" ? (
          <div>
            <label htmlFor="upload-progress">Upload progress</label>
            <progress id="upload-progress" max="100" value={uploadPercent}>
              {uploadPercent}%
            </progress>
          </div>
        ) : null}
        <p aria-live="polite" className="form-message" role="status">
          {message}
        </p>
      </section>

      {active?.status === "preview_ready" ? (
        <section className="section record" aria-labelledby="import-preview">
          <h2 id="import-preview">Preview before import</h2>
          <p>
            Found {active.discovered}{" "}
            {active.sourceKind === "linkedin_export" ? "recognized rows" : "messages"}.{" "}
            {active.skipped}{" "}
            {active.sourceKind === "linkedin_export"
              ? "files are unrecognized and ignored"
              : "exceed a limit and will be skipped"}
            . No normalized source records or review proposals have been written yet.
          </p>
          <div className="button-row">
            <button disabled={pending !== null} onClick={() => process(active)} type="button">
              Confirm and import
            </button>
            <button
              className="secondary"
              disabled={pending !== null}
              onClick={() => cancel(active)}
              type="button"
            >
              Cancel for now
            </button>
          </div>
        </section>
      ) : null}

      <section className="section" aria-labelledby="import-history">
        <h2 className="section-heading" id="import-history">
          Import history
        </h2>
        {imports.length === 0 ? <p>No historical imports yet.</p> : null}
        <ul className="record-list">
          {imports.map((item) => (
            <li className="record import-record" key={item.id}>
              <div>
                <h3>{item.displayName}</h3>
                <p className="source-note">
                  Source: {item.sourceKind === "linkedin_export" ? "LinkedIn export" : "Gmail MBOX"}
                  . Status: <strong>{item.status.replaceAll("_", " ")}</strong>. Created{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.createdAt))}
                </p>
              </div>
              <dl>
                <div>
                  <dt>Discovered</dt>
                  <dd>{item.discovered}</dd>
                </div>
                <div>
                  <dt>Parsed</dt>
                  <dd>{item.parsed}</dd>
                </div>
                <div>
                  <dt>Skipped</dt>
                  <dd>{item.skipped}</dd>
                </div>
                <div>
                  <dt>Duplicated</dt>
                  <dd>{item.duplicated}</dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd>{item.failed}</dd>
                </div>
                <div>
                  <dt>Imported</dt>
                  <dd>{item.imported}</dd>
                </div>
              </dl>
              {item.status === "processing" ? (
                <div>
                  <label htmlFor={`process-${item.id}`}>Import progress</label>
                  <progress id={`process-${item.id}`} max="100" value={processingPercent(item)} />
                </div>
              ) : null}
              {item.stagedSourceDeleted ? <p>Temporary source file deleted.</p> : null}
              {item.errorCode ? (
                <p>Error: {errorLabels[item.errorCode] ?? item.errorCode}</p>
              ) : null}
              <div className="button-row">
                {["paused_user", "paused_interrupted"].includes(item.status) ? (
                  <button disabled={pending !== null} onClick={() => process(item)} type="button">
                    Resume import
                  </button>
                ) : null}
                {item.status === "processing" ? (
                  <button className="secondary" onClick={() => cancel(item)} type="button">
                    Pause at checkpoint
                  </button>
                ) : null}
              </div>
              <details>
                <summary>Delete import history</summary>
                <p>
                  Deletes temporary source bytes, this history record, and its normalized messages.
                </p>
                <button disabled={pending !== null} onClick={() => remove(item)} type="button">
                  Delete this import record
                </button>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
