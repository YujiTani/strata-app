import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	date,
	integer,
	jsonb,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

// ユーザーの所持現在額の総額リミットは 9999億9999万9999までとする
export const MAX_BALANCE = 999_999_999_999;

export const players = pgTable("players", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: varchar("name", { length: 40 }).notNull(),
	last_idle_tick_at: timestamp("last_idle_tick_at", {
		mode: "date",
		withTimezone: true,
	})
		.defaultNow()
		.notNull(),
	last_login_at: timestamp("last_login_at", {
		mode: "date",
		withTimezone: true,
	})
		.defaultNow()
		.notNull(),
});

export const wallets = pgTable(
	"wallets",
	{
		player_id: uuid("player_id")
			.primaryKey()
			.references(() => players.id),
		balance: bigint("balance", { mode: "number" }).default(0).notNull(),
	},
	(table) => [
		check(
			"wallets_balance_range",
			sql`${table.balance} >= 0 AND ${table.balance} <= ${sql.raw(String(MAX_BALANCE))}`,
		),
	],
);

export const ledger_entries = pgTable(
	"ledger_entries",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		player_id: uuid("player_id")
			.notNull()
			.references(() => players.id),
		amount: bigint("amount", { mode: "number" }).notNull(),
		reason: varchar("reason", { length: 32 }).notNull(),
		ref_id: uuid("ref_id").notNull(),
		created_at: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [check("ledger_entries_amount_nonzero", sql`${table.amount} <> 0`)],
);

export const item_defs = pgTable("item_defs", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: varchar("name", { length: 80 }).notNull(),
	rarity: varchar("rarity", { length: 32 }).notNull(),
	kind: varchar("kind", { length: 32 }).notNull(),
	base_value: bigint("base_value", { mode: "number" }).notNull(),
	sprite_key: varchar("sprite_key", { length: 64 }).notNull(),
});

export const inventory_stacks = pgTable("inventory_stacks", {
	id: uuid("id").defaultRandom().primaryKey(),
	player_id: uuid("player_id")
		.notNull()
		.references(() => players.id),
	item_def_id: uuid("item_def_id")
		.notNull()
		.references(() => item_defs.id),
	quantity: integer("quantity").notNull(),
});

export const item_instances = pgTable("item_instances", {
	id: uuid("id").defaultRandom().primaryKey(),
	owner_id: uuid("owner_id")
		.notNull()
		.references(() => players.id),
	item_def_id: uuid("item_def_id")
		.notNull()
		.references(() => item_defs.id),
	rolled_stats: jsonb("rolled_stats").notNull(),
	is_listed: boolean("is_listed").notNull().default(false),
});

export const listings = pgTable("listings", {
	id: uuid("id").defaultRandom().primaryKey(),
	seller_id: uuid("seller_id")
		.notNull()
		.references(() => players.id),
	item_instance_id: uuid("item_instance_id")
		.notNull()
		.references(() => item_instances.id),
	price: bigint("price", { mode: "number" }).notNull(),
	status: varchar("status", { length: 20 }).notNull(),
	sold_to: uuid("sold_to").references(() => players.id),
	created_at: timestamp("created_at", {
		mode: "date",
		withTimezone: true,
	})
		.defaultNow()
		.notNull(),
});

export const village_buildings = pgTable("village_buildings", {
	id: uuid("id").defaultRandom().primaryKey(),
	player_id: uuid("player_id")
		.notNull()
		.references(() => players.id),
	building_type: varchar("building_type", { length: 64 }).notNull(),
	level: integer("level").notNull().default(1),
});

export const daily_claims = pgTable(
	"daily_claims",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		player_id: uuid("player_id")
			.notNull()
			.references(() => players.id),
		claim_date: date("claim_date").notNull(),
		claimed_at: timestamp("claimed_at", {
			mode: "date",
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		unique_player_date: uniqueIndex("daily_claims_player_id_claim_date").on(
			table.player_id,
			table.claim_date,
		),
	}),
);

export const drop_tables = pgTable("drop_tables", {
	id: uuid("id").defaultRandom().primaryKey(),
	depth_band: integer("depth_band").notNull(),
	item_def_id: uuid("item_def_id")
		.notNull()
		.references(() => item_defs.id),
	weight: integer("weight").notNull(),
	is_monster: boolean("is_monster").notNull().default(false),
});

export const table = {
	players,
	wallets,
} as const;

export type Table = typeof table;
