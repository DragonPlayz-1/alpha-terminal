import { afterAll } from "vitest";
import { db } from "@/lib/db";

const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema");
if (!schema?.startsWith("alpha_test_") || schema !== process.env.TEST_SCHEMA) {
  throw new Error("Tests must run in an isolated schema. Use npm test.");
}
afterAll(() => db.$disconnect());
