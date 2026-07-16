import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: ".env.development" });

const databaseUrl = process.env.DATABASE_URL_UNPOOLED;

if (!databaseUrl) {
	throw new Error("DATABASE_URL_UNPOOLED is not defined");
}

export default defineConfig({
	dialect: "postgresql",
	schema: "./db/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url: databaseUrl,
	},
});
