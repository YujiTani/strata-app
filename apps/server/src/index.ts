import { swagger } from "@elysiajs/swagger";
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Elysia, type HTTPHeaders, t } from "elysia";
import { insertPlayer, selectPlayer } from "../db/models/player";
import { selectWallet } from "../db/models/wallet";
import { table } from "../db/schema";

dotenv.config({ path: ".env.development" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is not defined");
}

const db = drizzle(databaseUrl);

if (!db) {
	throw new Error("Failed to initialize Drizzle ORM with the provided database URL");
}

function normalizeOrigin(origin: string): string {
	return origin.trim().replace(/\/+$/, "");
}

function getAllowedOrigins(): string[] {
	const rawAllowedOrigins = Bun.env.CORS_ALLOWED_ORIGINS;

	if (!rawAllowedOrigins) {
		throw new Error("CORS_ALLOWED_ORIGINS is not defined");
	}

	const origins = rawAllowedOrigins.split(",").map(normalizeOrigin).filter(Boolean);

	if (origins.length === 0) {
		throw new Error("CORS_ALLOWED_ORIGINS must contain at least one origin");
	}

	return origins;
}

const allowedOrigins = getAllowedOrigins();

function resolveAllowedOrigin(origin: string | null): string | undefined {
	if (!origin) return undefined;

	const normalizedOrigin = normalizeOrigin(origin);
	return allowedOrigins.includes(normalizedOrigin) ? normalizedOrigin : undefined;
}

function applyCorsHeaders(headers: HTTPHeaders, origin: string | null): void {
	const allowedOrigin = resolveAllowedOrigin(origin);
	if (!allowedOrigin) return;

	headers["Access-Control-Allow-Origin"] = allowedOrigin;
	headers.Vary = "Origin";
	headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
	headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization,Idempotency-Key";
	headers["Access-Control-Max-Age"] = "86400";
}

const players = new Elysia({ prefix: "players" })
	.get("/", () => "Players List")
	.get("/:id", ({ params: { id } }) => `Player ID: ${id}`)
	.post(
		"/",
		async ({ body }) => {
			const result = await db.transaction(async (tx) => {
				const [newPlayer] = await tx.insert(table.players).values(body).returning();

				if (!newPlayer) {
					throw new Error("Failed to insert player");
				}

				const [newWallet] = await tx
					.insert(table.wallets)
					.values({ player_id: newPlayer.id, balance: 0 })
					.returning();

				if (!newWallet) {
					throw new Error("Failed to insert wallet");
				}
				return { newPlayer, newWallet };
			});

			return {
				player: result.newPlayer,
				wallet: result.newWallet,
			};
		},
		{
			body: insertPlayer,
			response: {
				200: t.Object({
					player: t.Object({
						...selectPlayer,
					}),
					wallet: t.Object({
						...selectWallet,
					}),
				}),
			},
		},
	);

new Elysia()
	.onRequest(({ request, set }) => {
		applyCorsHeaders(set.headers, request.headers.get("Origin"));
	})
	.options("/*", ({ request, set }) => {
		applyCorsHeaders(set.headers, request.headers.get("Origin"));
		set.status = 204;
		return;
	})
	.decorate("db", db)
	.use(swagger())
	.use(players)
	.get("/", () => "Hello World")
	.get("/health", () => "Hi! I'm healthy!")
	.listen(8080);
