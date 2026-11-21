CREATE TABLE "bankroll_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"session_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "hands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"hand_number" integer NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"learning_mode" boolean NOT NULL,
	"small_blind" integer NOT NULL,
	"big_blind" integer NOT NULL,
	"num_players" integer NOT NULL,
	"hero_seat" integer NOT NULL,
	"button_seat" integer NOT NULL,
	"hero_position" text NOT NULL,
	"hero_hole_cards" text NOT NULL,
	"board" text NOT NULL,
	"pot_total" integer NOT NULL,
	"rake" integer NOT NULL,
	"hero_net" integer NOT NULL,
	"hero_rake_paid" integer NOT NULL,
	"hero_vpip" boolean NOT NULL,
	"hero_pfr" boolean NOT NULL,
	"hero_saw_flop" boolean NOT NULL,
	"went_to_showdown" boolean NOT NULL,
	"hero_won" boolean NOT NULL,
	"engine_version" integer DEFAULT 1 NOT NULL,
	"events" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"seed" text NOT NULL,
	"learning_mode" boolean NOT NULL,
	"small_blind" integer NOT NULL,
	"big_blind" integer NOT NULL,
	"rake_bps" integer NOT NULL,
	"rake_cap" integer NOT NULL,
	"rake_round_to" integer NOT NULL,
	"no_flop_no_drop" boolean NOT NULL,
	"opponents" integer NOT NULL,
	"bot_profiles" jsonb NOT NULL,
	"stop_loss" integer,
	"total_bought_in" integer NOT NULL,
	"cashed_out" integer,
	"hands_played" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"buy_in_rule" integer DEFAULT 25 NOT NULL,
	"default_opponents" integer DEFAULT 3 NOT NULL,
	"default_small_blind" integer DEFAULT 100 NOT NULL,
	"default_big_blind" integer DEFAULT 200 NOT NULL,
	"default_buy_in_bb" integer DEFAULT 100 NOT NULL,
	"rake_preset" text DEFAULT 'live' NOT NULL,
	"rake_bps" integer DEFAULT 1000 NOT NULL,
	"rake_cap" integer DEFAULT 600 NOT NULL,
	"rake_round_to" integer DEFAULT 100 NOT NULL,
	"no_flop_no_drop" boolean DEFAULT true NOT NULL,
	"stop_loss_buy_ins" integer,
	"auto_skip_when_folded" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bankroll_transactions" ADD CONSTRAINT "bankroll_transactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hands" ADD CONSTRAINT "hands_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hands_session_number" ON "hands" USING btree ("session_id","hand_number");--> statement-breakpoint
CREATE INDEX "hands_played_at" ON "hands" USING btree ("played_at");