import { basename } from "node:path";

export function truncateUtf8(value: string, maximumBytes: number) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.byteLength <= maximumBytes) return { value, truncated: false };
  let end = maximumBytes;
  while (end > 0 && (encoded[end] ?? 0) >= 0x80 && (encoded[end] & 0xc0) === 0x80) end -= 1;
  return { value: encoded.subarray(0, end).toString("utf8"), truncated: true };
}

export function stripControlCharacters(value: string, replacement = "") {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? replacement : character;
  }).join("");
}

export function sanitizeDisplayName(value: string | null | undefined, maximumBytes = 255) {
  const leaf = basename((value ?? "").replaceAll("\\", "/"));
  const cleaned = stripControlCharacters(leaf.normalize("NFC")).trim();
  return truncateUtf8(cleaned || "unnamed", maximumBytes).value;
}
