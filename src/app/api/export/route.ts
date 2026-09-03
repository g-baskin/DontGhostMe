import { exportData } from "@/application/export-data";
import { repository, syntheticOwnerId } from "@/application/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(exportData(repository, syntheticOwnerId), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": 'attachment; filename="dontghostme-synthetic-export.json"',
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
