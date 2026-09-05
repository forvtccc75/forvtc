DO $$ BEGIN
 CREATE TYPE "public"."boost_status" AS ENUM('attente_paiement', 'actif', 'expire', 'annule');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."boost_type" AS ENUM('remontee', 'urgent', 'a_la_une');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listing_boosts" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"type" "boost_type" NOT NULL,
	"prix_cents" integer NOT NULL,
	"statut" "boost_status" DEFAULT 'attente_paiement' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"date_debut" timestamp with time zone,
	"date_fin" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "boosted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "urgent_jusqu" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "une_jusqu" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "boosts_listing_idx" ON "listing_boosts" USING btree ("listing_id");