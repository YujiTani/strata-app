ALTER TABLE "listings" RENAME TO "market_listings";--> statement-breakpoint
ALTER TABLE "market_listings" DROP CONSTRAINT "listings_seller_id_players_id_fk";
--> statement-breakpoint
ALTER TABLE "market_listings" DROP CONSTRAINT "listings_item_instance_id_item_instances_id_fk";
--> statement-breakpoint
ALTER TABLE "market_listings" DROP CONSTRAINT "listings_sold_to_players_id_fk";
--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_seller_id_players_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_sold_to_players_id_fk" FOREIGN KEY ("sold_to") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;