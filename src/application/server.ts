import "server-only";
import { createDatabaseConnection } from "@/db/client";
import { createRepository } from "@/db/repositories";
import { SYNTHETIC_OWNER_ID } from "@/test/fixtures/jane-conversation";

const database = createDatabaseConnection();

export const repository = createRepository(database);
export const syntheticOwnerId = SYNTHETIC_OWNER_ID;
