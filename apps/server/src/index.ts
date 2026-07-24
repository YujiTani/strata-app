import { swagger } from "@elysiajs/swagger";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Elysia, type HTTPHeaders, t } from "elysia";
import { insertPlayer, selectPlayer } from "../db/models/player";
import { selectWallet } from "../db/models/wallet";
import { MAX_BALANCE, table } from "../db/schema";

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
	)
	.post(
		"/:id/tick",
		async ({ params: { id } }) => {
			const result = await db.transaction(async (tx) => {
				const [player] = await tx
					.select({
						id: table.players.id,
						last_idle_tick_at: table.players.last_idle_tick_at,
						dbNow: sql<Date>`now()`.mapWith((value) => new Date(value)),
					})
					.from(table.players)
					.where(eq(table.players.id, id))
					.for("update");

				if (!player) {
					throw new Error("Player not found");
				}

				const [wallet] = await tx
					.select({ player_id: table.wallets.player_id, balance: table.wallets.balance })
					.from(table.wallets)
					.where(eq(table.wallets.player_id, id))
					.for("update");

				if (!wallet) {
					throw new Error("Wallet not found");
				}

				const overTimeMilliSeconds = Math.max(
					0,
					Math.floor(player.dbNow.getTime() - player.last_idle_tick_at.getTime()),
				);
				const overTimeCredit = Math.floor(overTimeMilliSeconds / 30000);
				const overTimeBalance = Math.min(MAX_BALANCE - wallet.balance, overTimeCredit * 5);
				const new_last_idle_tick_at = new Date(
					player.last_idle_tick_at.getTime() + overTimeCredit * 30000,
				);

				// overTimeBalanceが0の場合でも、プレイヤーのlast_idle_tick_atは進める
				if (overTimeCredit > 0) {
					await tx
						.update(table.players)
						.set({ last_idle_tick_at: new_last_idle_tick_at })
						.where(eq(table.players.id, id));
				}

				// overTimeBalanceが0の場合は、ウォレットの更新やレジャーエントリの作成は行わない
				if (overTimeBalance > 0) {
					const [updatedWallet] = await tx
						.update(table.wallets)
						.set({ balance: wallet.balance + overTimeBalance })
						.where(eq(table.wallets.player_id, id))
						.returning();

					if (!updatedWallet) {
						throw new Error("Failed to update wallet");
					}

					const [idleTickEvent] = await tx
						.insert(table.idle_tick_events)
						.values({ player_id: id })
						.returning();

					if (!idleTickEvent) {
						throw new Error("Failed to insert idle tick event");
					}

					await tx.insert(table.ledger_entries).values({
						player_id: id,
						amount: overTimeBalance,
						reason: "reward",
						ref_id: idleTickEvent.id,
					});

					return {
						currentBalance: updatedWallet?.balance,
						overTimeBalance,
					};
				}

				return {
					currentBalance: wallet.balance,
					overTimeBalance: 0,
				};
			});

			return result;
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			response: {
				200: t.Object({
					currentBalance: t.Number(),
					overTimeBalance: t.Number(),
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
