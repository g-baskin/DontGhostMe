import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { withImmediateTransaction } from "@/db/write";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("bounded SQLite writer retries", () => {
  it("retries SQLITE_BUSY and commits after the writer becomes available", async () => {
    const root = mkdtempSync(join(tmpdir(), "dontghostme-busy-"));
    roots.push(root);
    const path = join(root, "busy.sqlite");
    const sqlite = new Database(path);
    sqlite.exec("create table events (id integer primary key)");
    sqlite.pragma("busy_timeout = 1");
    const worker = new Worker(
      `
        const { parentPort, workerData } = require("node:worker_threads");
        const Database = require("better-sqlite3");
        const database = new Database(workerData);
        database.exec("begin immediate");
        parentPort.postMessage("locked");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60);
        database.exec("commit");
        database.close();
      `,
      { eval: true, workerData: path },
    );
    await new Promise<void>((resolve, reject) => {
      worker.once("message", () => resolve());
      worker.once("error", reject);
    });

    withImmediateTransaction({ sqlite }, () => {
      sqlite.prepare("insert into events default values").run();
    });

    expect(sqlite.prepare("select count(*) as count from events").get()).toEqual({ count: 1 });
    await worker.terminate();
    sqlite.close();
  });
});
