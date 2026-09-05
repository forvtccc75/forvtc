CREATE TABLE IF NOT EXISTS "contract_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"corps" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"inspection_id" text NOT NULL,
	"path" text NOT NULL,
	"zone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspections" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"type" text NOT NULL,
	"kilometrage" integer NOT NULL,
	"carburant_pct" integer,
	"batterie_pct" integer,
	"carrosserie" text NOT NULL,
	"interieur" text NOT NULL,
	"pneus" text NOT NULL,
	"degats" text,
	"fait_par" text NOT NULL,
	"valide_par_autre_partie" boolean DEFAULT false NOT NULL,
	"valide_le" timestamp with time zone,
	"valide_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contract_signatures" ALTER COLUMN "provider" SET DEFAULT 'interne_simple';--> statement-breakpoint
ALTER TABLE "contract_signatures" ALTER COLUMN "provider" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD COLUMN "role" text NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD COLUMN "consent_text" text;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD COLUMN "doc_hash" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "pdf_hash" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspections" ADD CONSTRAINT "inspections_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspections" ADD CONSTRAINT "inspections_fait_par_users_id_fk" FOREIGN KEY ("fait_par") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contract_templates_code_version_idx" ON "contract_templates" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inspections_booking_type_idx" ON "inspections" USING btree ("booking_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "signatures_contract_user_idx" ON "contract_signatures" USING btree ("contract_id","user_id");