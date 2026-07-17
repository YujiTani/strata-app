CREATE TABLE "daily_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"claim_date" date NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"depth_band" integer NOT NULL,
	"item_def_id" uuid NOT NULL,
	"weight" integer NOT NULL,
	"is_monster" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_stacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"item_def_id" uuid NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"rarity" varchar(32) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"base_value" bigint NOT NULL,
	"sprite_key" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"item_def_id" uuid NOT NULL,
	"rolled_stats" jsonb NOT NULL,
	"is_listed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"reason" varchar(32) NOT NULL,
	"ref_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_nonzero" CHECK ("ledger_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"status" varchar(20) NOT NULL,
	"sold_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(40) NOT NULL,
	"last_idle_tick_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "village_buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"building_type" varchar(64) NOT NULL,
	"level" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "wallets_balance_range" CHECK ("wallets"."balance" >= 0 AND "wallets"."balance" <= 999999999999)
);
--> statement-breakpoint
ALTER TABLE "daily_claims" ADD CONSTRAINT "daily_claims_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_tables" ADD CONSTRAINT "drop_tables_item_def_id_item_defs_id_fk" FOREIGN KEY ("item_def_id") REFERENCES "public"."item_defs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stacks" ADD CONSTRAINT "inventory_stacks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stacks" ADD CONSTRAINT "inventory_stacks_item_def_id_item_defs_id_fk" FOREIGN KEY ("item_def_id") REFERENCES "public"."item_defs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_item_def_id_item_defs_id_fk" FOREIGN KEY ("item_def_id") REFERENCES "public"."item_defs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_players_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_sold_to_players_id_fk" FOREIGN KEY ("sold_to") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "village_buildings" ADD CONSTRAINT "village_buildings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_claims_player_id_claim_date" ON "daily_claims" USING btree ("player_id","claim_date");