import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/drizzle/schema.ts",
  out: "./supabase/migrations/generated",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/famplan",
  },
});
