import { describe, expect, it } from "vitest";
import { assertLocalMutationRequest } from "@/application/local-request";

function request(host: string, origin?: string) {
  return new Request("http://127.0.0.1:3000/api/imports", {
    method: "POST",
    headers: { host, ...(origin ? { origin } : {}) },
  });
}

describe("local mutation request guard", () => {
  it.each([
    ["127.0.0.1:3000", "http://127.0.0.1:3000"],
    ["localhost:3000", "http://localhost:3000"],
    ["[::1]:3000", "http://[::1]:3000"],
  ])("accepts local host %s", (host, origin) => {
    expect(() => assertLocalMutationRequest(request(host, origin))).not.toThrow();
  });

  it.each([
    ["evil.example", "http://evil.example"],
    ["127.0.0.1:3000", "https://127.0.0.1:3000"],
    ["127.0.0.1:3000", "http://evil.example"],
    ["127.0.0.1:3000", "http://localhost:3000"],
    ["127.0.0.1:3000", "http://127.0.0.1:3001"],
  ])("rejects non-local mutation %s", (host, origin) => {
    expect(() => assertLocalMutationRequest(request(host, origin))).toThrowError(
      expect.objectContaining({ code: "invalid_request" }),
    );
  });
});
