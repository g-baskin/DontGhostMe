import "server-only";
import { cleanupExpiredImports } from "@/application/historical-imports";
import { createDatabaseConnection } from "@/db/client";
import { createRepository } from "@/db/repositories";
import { SYNTHETIC_OWNER_ID } from "@/test/fixtures/jane-conversation";

export const database = createDatabaseConnection();
await cleanupExpiredImports(database, SYNTHETIC_OWNER_ID);

export const repository = createRepository(database);
export const syntheticOwnerId = SYNTHETIC_OWNER_ID;
