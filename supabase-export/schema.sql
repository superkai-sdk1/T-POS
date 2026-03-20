--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";


--
-- Name: EXTENSION "pg_graphql"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "pg_graphql" IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "pg_stat_statements"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "pg_stat_statements" IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


--
-- Name: EXTENSION "supabase_vault"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "supabase_vault" IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."booking_status" AS ENUM (
    'booked',
    'active',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";

--
-- Name: check_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."check_status" AS ENUM (
    'open',
    'closed'
);


ALTER TYPE "public"."check_status" OWNER TO "postgres";

--
-- Name: discount_target; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."discount_target" AS ENUM (
    'check',
    'item'
);


ALTER TYPE "public"."discount_target" OWNER TO "postgres";

--
-- Name: discount_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."discount_type" AS ENUM (
    'percentage',
    'fixed'
);


ALTER TYPE "public"."discount_type" OWNER TO "postgres";

--
-- Name: event_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."event_status" AS ENUM (
    'planned',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."event_status" OWNER TO "postgres";

--
-- Name: item_category; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."item_category" AS ENUM (
    'drinks',
    'food',
    'bar',
    'hookah',
    'services'
);


ALTER TYPE "public"."item_category" OWNER TO "postgres";

--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."payment_method" AS ENUM (
    'cash',
    'card',
    'debt',
    'bonus',
    'split',
    'deposit'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";

--
-- Name: space_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."space_type" AS ENUM (
    'cabin_small',
    'cabin_big',
    'hall'
);


ALTER TYPE "public"."space_type" OWNER TO "postgres";

--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."transaction_type" AS ENUM (
    'supply',
    'write_off',
    'sale',
    'revision',
    'bonus_accrual',
    'bonus_spend',
    'cash_operation',
    'debt_adjustment',
    'refund'
);


ALTER TYPE "public"."transaction_type" OWNER TO "postgres";

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."user_role" AS ENUM (
    'owner',
    'staff',
    'client'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";

--
-- Name: decrement_stock("uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."decrement_stock"("p_item_id" "uuid", "p_qty" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update inventory
  set stock_quantity = stock_quantity - p_qty
  where id = p_item_id and track_stock = true;
end;
$$;


ALTER FUNCTION "public"."decrement_stock"("p_item_id" "uuid", "p_qty" numeric) OWNER TO "postgres";

--
-- Name: increment_stock("uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."increment_stock"("p_item_id" "uuid", "p_qty" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update inventory set stock_quantity = stock_quantity + p_qty where id = p_item_id and track_stock = true;
end;
$$;


ALTER FUNCTION "public"."increment_stock"("p_item_id" "uuid", "p_qty" numeric) OWNER TO "postgres";

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";

--
-- Name: bonus_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."bonus_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "balance_after" numeric DEFAULT 0 NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bonus_history" OWNER TO "postgres";

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "space_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "check_id" "uuid",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "rental_amount" numeric DEFAULT 0 NOT NULL,
    "note" "text",
    "status" "public"."booking_status" DEFAULT 'booked'::"public"."booking_status" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."bookings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."bookings" OWNER TO "postgres";

--
-- Name: cash_operations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."cash_operations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shift_id" "uuid",
    "type" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cash_operations_type_check" CHECK (("type" = ANY (ARRAY['inkassation'::"text", 'deposit'::"text", 'shift_open'::"text", 'shift_close'::"text", 'salary'::"text"])))
);

ALTER TABLE ONLY "public"."cash_operations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."cash_operations" OWNER TO "postgres";

--
-- Name: certificates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."certificates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "nominal" numeric NOT NULL,
    "balance" numeric NOT NULL,
    "is_used" boolean DEFAULT false NOT NULL,
    "used_by" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "used_at" timestamp with time zone
);


ALTER TABLE "public"."certificates" OWNER TO "postgres";

--
-- Name: check_discounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."check_discounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "check_id" "uuid" NOT NULL,
    "discount_id" "uuid",
    "target" "public"."discount_target" DEFAULT 'check'::"public"."discount_target" NOT NULL,
    "item_id" "uuid",
    "discount_amount" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_rule_id" "uuid"
);

ALTER TABLE ONLY "public"."check_discounts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."check_discounts" OWNER TO "postgres";

--
-- Name: check_item_modifiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."check_item_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "check_item_id" "uuid" NOT NULL,
    "modifier_id" "uuid" NOT NULL,
    "price_at_time" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."check_item_modifiers" OWNER TO "postgres";

--
-- Name: check_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."check_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "check_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "price_at_time" numeric NOT NULL
);

ALTER TABLE ONLY "public"."check_items" REPLICA IDENTITY FULL;


ALTER TABLE "public"."check_items" OWNER TO "postgres";

--
-- Name: check_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."check_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "check_id" "uuid" NOT NULL,
    "method" "public"."payment_method" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."check_payments" OWNER TO "postgres";

--
-- Name: checks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid",
    "staff_id" "uuid",
    "status" "public"."check_status" DEFAULT 'open'::"public"."check_status" NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "payment_method" "public"."payment_method",
    "bonus_used" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "shift_id" "uuid",
    "note" "text",
    "discount_total" numeric DEFAULT 0 NOT NULL,
    "space_id" "uuid",
    "guest_names" "text",
    "certificate_used" numeric DEFAULT 0 NOT NULL,
    "certificate_id" "uuid"
);

ALTER TABLE ONLY "public"."checks" REPLICA IDENTITY FULL;


ALTER TABLE "public"."checks" OWNER TO "postgres";

--
-- Name: client_discount_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."client_discount_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "discount_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."client_discount_rules" REPLICA IDENTITY FULL;


ALTER TABLE "public"."client_discount_rules" OWNER TO "postgres";

--
-- Name: discounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."discounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "public"."discount_type" NOT NULL,
    "value" numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "min_quantity" integer,
    "item_id" "uuid",
    "is_auto" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."discounts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."discounts" OWNER TO "postgres";

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "location" "text",
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone,
    "payment_type" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "fixed_amount" numeric(10,2),
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "comment" "text",
    "reminders" "jsonb" DEFAULT '[]'::"jsonb",
    "check_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "events_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['fixed'::"text", 'hourly'::"text"]))),
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "events_type_check" CHECK (("type" = ANY (ARRAY['titan'::"text", 'exit'::"text"])))
);

ALTER TABLE ONLY "public"."events" REPLICA IDENTITY FULL;


ALTER TABLE "public"."events" OWNER TO "postgres";

--
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "description" "text",
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expenses_category_check" CHECK (("category" = ANY (ARRAY['rent'::"text", 'utilities'::"text", 'salary'::"text", 'other'::"text"])))
);

ALTER TABLE ONLY "public"."expenses" REPLICA IDENTITY FULL;


ALTER TABLE "public"."expenses" OWNER TO "postgres";

--
-- Name: inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "price" numeric DEFAULT 0 NOT NULL,
    "stock_quantity" numeric DEFAULT 0 NOT NULL,
    "min_threshold" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "search_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_top" boolean DEFAULT false NOT NULL,
    "track_stock" boolean DEFAULT true NOT NULL,
    "is_service" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."inventory" REPLICA IDENTITY FULL;


ALTER TABLE "public"."inventory" OWNER TO "postgres";

--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."menu_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "parent_id" "uuid",
    "icon_name" "text" DEFAULT 'Package'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "color" "text" DEFAULT 'slate'::"text"
);

ALTER TABLE ONLY "public"."menu_categories" REPLICA IDENTITY FULL;


ALTER TABLE "public"."menu_categories" OWNER TO "postgres";

--
-- Name: modifiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."modifiers" REPLICA IDENTITY FULL;


ALTER TABLE "public"."modifiers" OWNER TO "postgres";

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";

--
-- Name: product_modifiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."product_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "modifier_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_modifiers" OWNER TO "postgres";

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nickname" "text" NOT NULL,
    "is_resident" boolean DEFAULT false NOT NULL,
    "balance" numeric DEFAULT 0 NOT NULL,
    "bonus_points" numeric DEFAULT 0 NOT NULL,
    "tg_id" "text",
    "role" "public"."user_role" DEFAULT 'staff'::"public"."user_role" NOT NULL,
    "password_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "photo_url" "text",
    "birthday" "date",
    "pin" "text",
    "client_tier" "text" DEFAULT 'regular'::"text" NOT NULL,
    "tg_username" "text",
    "deleted_at" timestamp with time zone,
    "search_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "permissions" "jsonb",
    CONSTRAINT "profiles_client_tier_check" CHECK (("client_tier" = ANY (ARRAY['regular'::"text", 'resident'::"text", 'student'::"text"])))
);

ALTER TABLE ONLY "public"."profiles" REPLICA IDENTITY FULL;


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: refund_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."refund_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "refund_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "price_at_time" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."refund_items" OWNER TO "postgres";

--
-- Name: refunds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "check_id" "uuid" NOT NULL,
    "shift_id" "uuid",
    "refund_type" "text" NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "bonus_deducted" numeric DEFAULT 0 NOT NULL,
    "bonus_returned" numeric DEFAULT 0 NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "refunds_refund_type_check" CHECK (("refund_type" = ANY (ARRAY['full'::"text", 'partial'::"text"])))
);

ALTER TABLE ONLY "public"."refunds" REPLICA IDENTITY FULL;


ALTER TABLE "public"."refunds" OWNER TO "postgres";

--
-- Name: revision_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."revision_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "revision_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "expected_qty" numeric DEFAULT 0 NOT NULL,
    "actual_qty" numeric DEFAULT 0 NOT NULL,
    "diff" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."revision_items" OWNER TO "postgres";

--
-- Name: revisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "note" "text",
    "total_diff" numeric DEFAULT 0 NOT NULL,
    "items_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."revisions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."revisions" OWNER TO "postgres";

--
-- Name: salary_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."salary_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "shift_id" "uuid",
    "payment_method" "text" NOT NULL,
    "cash_operation_id" "uuid",
    "paid_by" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "salary_payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'transfer'::"text"])))
);

ALTER TABLE ONLY "public"."salary_payments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."salary_payments" OWNER TO "postgres";

--
-- Name: salary_skipped_shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."salary_skipped_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."salary_skipped_shifts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."salary_skipped_shifts" OWNER TO "postgres";

--
-- Name: shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "opened_by" "uuid" NOT NULL,
    "closed_by" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "cash_start" numeric DEFAULT 0 NOT NULL,
    "cash_end" numeric,
    "note" "text",
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "evening_type" "text",
    CONSTRAINT "shifts_evening_type_check" CHECK ((("evening_type" IS NULL) OR ("evening_type" = ANY (ARRAY['sport_mafia'::"text", 'city_mafia'::"text", 'kids_mafia'::"text", 'board_games'::"text", 'no_event'::"text"])))),
    CONSTRAINT "shifts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);

ALTER TABLE ONLY "public"."shifts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."shifts" OWNER TO "postgres";

--
-- Name: spaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."spaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "public"."space_type" NOT NULL,
    "hourly_rate" numeric,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."spaces" OWNER TO "postgres";

--
-- Name: supplies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."supplies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "note" "text",
    "total_cost" numeric DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" "text" DEFAULT 'transfer'::"text" NOT NULL,
    CONSTRAINT "supplies_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'transfer'::"text"])))
);

ALTER TABLE ONLY "public"."supplies" REPLICA IDENTITY FULL;


ALTER TABLE "public"."supplies" OWNER TO "postgres";

--
-- Name: supply_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."supply_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "cost_per_unit" numeric DEFAULT 0 NOT NULL,
    "total_cost" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."supply_items" OWNER TO "postgres";

--
-- Name: tg_link_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."tg_link_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tg_id" "text" NOT NULL,
    "tg_username" "text",
    "tg_first_name" "text",
    "profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tg_link_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

ALTER TABLE ONLY "public"."tg_link_requests" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tg_link_requests" OWNER TO "postgres";

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "public"."transaction_type" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "description" "text",
    "item_id" "uuid",
    "check_id" "uuid",
    "player_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";

--
-- Name: user_notification_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_notification_settings" (
    "user_id" "uuid" NOT NULL,
    "types" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_notification_settings" OWNER TO "postgres";

--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");


--
-- Name: bonus_history bonus_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bonus_history"
    ADD CONSTRAINT "bonus_history_pkey" PRIMARY KEY ("id");


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");


--
-- Name: cash_operations cash_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_operations"
    ADD CONSTRAINT "cash_operations_pkey" PRIMARY KEY ("id");


--
-- Name: certificates certificates_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_code_key" UNIQUE ("code");


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_pkey" PRIMARY KEY ("id");


--
-- Name: check_discounts check_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_discounts"
    ADD CONSTRAINT "check_discounts_pkey" PRIMARY KEY ("id");


--
-- Name: check_item_modifiers check_item_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_item_modifiers"
    ADD CONSTRAINT "check_item_modifiers_pkey" PRIMARY KEY ("id");


--
-- Name: check_items check_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_items"
    ADD CONSTRAINT "check_items_pkey" PRIMARY KEY ("id");


--
-- Name: check_payments check_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_payments"
    ADD CONSTRAINT "check_payments_pkey" PRIMARY KEY ("id");


--
-- Name: checks checks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."checks"
    ADD CONSTRAINT "checks_pkey" PRIMARY KEY ("id");


--
-- Name: client_discount_rules client_discount_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."client_discount_rules"
    ADD CONSTRAINT "client_discount_rules_pkey" PRIMARY KEY ("id");


--
-- Name: client_discount_rules client_discount_rules_profile_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."client_discount_rules"
    ADD CONSTRAINT "client_discount_rules_profile_id_item_id_key" UNIQUE ("profile_id", "item_id");


--
-- Name: discounts discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."discounts"
    ADD CONSTRAINT "discounts_pkey" PRIMARY KEY ("id");


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id");


--
-- Name: menu_categories menu_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_slug_key" UNIQUE ("slug");


--
-- Name: modifiers modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."modifiers"
    ADD CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: product_modifiers product_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_modifiers"
    ADD CONSTRAINT "product_modifiers_pkey" PRIMARY KEY ("id");


--
-- Name: product_modifiers product_modifiers_product_id_modifier_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_modifiers"
    ADD CONSTRAINT "product_modifiers_product_id_modifier_id_key" UNIQUE ("product_id", "modifier_id");


--
-- Name: profiles profiles_nickname_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_nickname_key" UNIQUE ("nickname");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_tg_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_tg_id_key" UNIQUE ("tg_id");


--
-- Name: refund_items refund_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."refund_items"
    ADD CONSTRAINT "refund_items_pkey" PRIMARY KEY ("id");


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");


--
-- Name: revision_items revision_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."revision_items"
    ADD CONSTRAINT "revision_items_pkey" PRIMARY KEY ("id");


--
-- Name: revisions revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."revisions"
    ADD CONSTRAINT "revisions_pkey" PRIMARY KEY ("id");


--
-- Name: salary_payments salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salary_payments"
    ADD CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id");


--
-- Name: salary_skipped_shifts salary_skipped_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salary_skipped_shifts"
    ADD CONSTRAINT "salary_skipped_shifts_pkey" PRIMARY KEY ("id");


--
-- Name: salary_skipped_shifts salary_skipped_shifts_shift_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salary_skipped_shifts"
    ADD CONSTRAINT "salary_skipped_shifts_shift_id_key" UNIQUE ("shift_id");


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");


--
-- Name: spaces spaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."spaces"
    ADD CONSTRAINT "spaces_pkey" PRIMARY KEY ("id");


--
-- Name: supplies supplies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_pkey" PRIMARY KEY ("id");


--
-- Name: supply_items supply_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."supply_items"
    ADD CONSTRAINT "supply_items_pkey" PRIMARY KEY ("id");


--
-- Name: tg_link_requests tg_link_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tg_link_requests"
    ADD CONSTRAINT "tg_link_requests_pkey" PRIMARY KEY ("id");


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");


--
-- Name: user_notification_settings user_notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_notification_settings"
    ADD CONSTRAINT "user_notification_settings_pkey" PRIMARY KEY ("user_id");


--
-- Name: idx_bonus_history_profile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_bonus_history_profile" ON "public"."bonus_history" USING "btree" ("profile_id");


--
-- Name: idx_cash_operations_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cash_operations_created_at" ON "public"."cash_operations" USING "btree" ("created_at");


--
-- Name: idx_cash_operations_shift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cash_operations_shift" ON "public"."cash_operations" USING "btree" ("shift_id");


--
-- Name: idx_certificates_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_certificates_code" ON "public"."certificates" USING "btree" ("code");


--
-- Name: idx_check_item_modifiers_ci; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_check_item_modifiers_ci" ON "public"."check_item_modifiers" USING "btree" ("check_item_id");


--
-- Name: idx_check_items_check; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_check_items_check" ON "public"."check_items" USING "btree" ("check_id");


--
-- Name: idx_checks_player; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_checks_player" ON "public"."checks" USING "btree" ("player_id");


--
-- Name: idx_checks_shift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_checks_shift" ON "public"."checks" USING "btree" ("shift_id");


--
-- Name: idx_checks_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_checks_status" ON "public"."checks" USING "btree" ("status");


--
-- Name: idx_client_discount_rules_discount; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_client_discount_rules_discount" ON "public"."client_discount_rules" USING "btree" ("discount_id");


--
-- Name: idx_client_discount_rules_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_client_discount_rules_item" ON "public"."client_discount_rules" USING "btree" ("item_id");


--
-- Name: idx_client_discount_rules_profile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_client_discount_rules_profile" ON "public"."client_discount_rules" USING "btree" ("profile_id");


--
-- Name: idx_expenses_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_expenses_category" ON "public"."expenses" USING "btree" ("category");


--
-- Name: idx_expenses_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_expenses_date" ON "public"."expenses" USING "btree" ("expense_date");


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);


--
-- Name: idx_product_modifiers_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_modifiers_product" ON "public"."product_modifiers" USING "btree" ("product_id");


--
-- Name: idx_profiles_nickname; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_profiles_nickname" ON "public"."profiles" USING "btree" ("nickname");


--
-- Name: idx_profiles_tg_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_profiles_tg_id" ON "public"."profiles" USING "btree" ("tg_id");


--
-- Name: idx_revision_items_revision; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_revision_items_revision" ON "public"."revision_items" USING "btree" ("revision_id");


--
-- Name: idx_revisions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_revisions_created_at" ON "public"."revisions" USING "btree" ("created_at");


--
-- Name: idx_salary_payments_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_salary_payments_created_at" ON "public"."salary_payments" USING "btree" ("created_at");


--
-- Name: idx_salary_payments_profile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_salary_payments_profile" ON "public"."salary_payments" USING "btree" ("profile_id");


--
-- Name: idx_salary_payments_shift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_salary_payments_shift" ON "public"."salary_payments" USING "btree" ("shift_id");


--
-- Name: idx_salary_skipped_shifts_shift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_salary_skipped_shifts_shift" ON "public"."salary_skipped_shifts" USING "btree" ("shift_id");


--
-- Name: idx_shifts_opened_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_shifts_opened_at" ON "public"."shifts" USING "btree" ("opened_at");


--
-- Name: idx_shifts_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_shifts_status" ON "public"."shifts" USING "btree" ("status");


--
-- Name: idx_supplies_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_supplies_created_at" ON "public"."supplies" USING "btree" ("created_at");


--
-- Name: idx_supply_items_supply; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_supply_items_supply" ON "public"."supply_items" USING "btree" ("supply_id");


--
-- Name: idx_tg_link_requests_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_tg_link_requests_status" ON "public"."tg_link_requests" USING "btree" ("status");


--
-- Name: idx_transactions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_transactions_created_at" ON "public"."transactions" USING "btree" ("created_at");


--
-- Name: idx_transactions_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_transactions_type" ON "public"."transactions" USING "btree" ("type");


--
-- Name: inventory trg_inventory_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_inventory_updated_at" BEFORE UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_events_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: bonus_history bonus_history_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bonus_history"
    ADD CONSTRAINT "bonus_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: bookings bookings_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id");


--
-- Name: bookings bookings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id");


--
-- Name: bookings bookings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: bookings bookings_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id");


--
-- Name: cash_operations cash_operations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_operations"
    ADD CONSTRAINT "cash_operations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: cash_operations cash_operations_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_operations"
    ADD CONSTRAINT "cash_operations_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;


--
-- Name: certificates certificates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: certificates certificates_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."profiles"("id");


--
-- Name: check_discounts check_discounts_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_discounts"
    ADD CONSTRAINT "check_discounts_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE CASCADE;


--
-- Name: check_discounts check_discounts_client_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_discounts"
    ADD CONSTRAINT "check_discounts_client_rule_id_fkey" FOREIGN KEY ("client_rule_id") REFERENCES "public"."client_discount_rules"("id") ON DELETE SET NULL;


--
-- Name: check_discounts check_discounts_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_discounts"
    ADD CONSTRAINT "check_discounts_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id");


--
-- Name: check_discounts check_discounts_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_discounts"
    ADD CONSTRAINT "check_discounts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."check_items"("id") ON DELETE CASCADE;


--
-- Name: check_item_modifiers check_item_modifiers_check_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_item_modifiers"
    ADD CONSTRAINT "check_item_modifiers_check_item_id_fkey" FOREIGN KEY ("check_item_id") REFERENCES "public"."check_items"("id") ON DELETE CASCADE;


--
-- Name: check_item_modifiers check_item_modifiers_modifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_item_modifiers"
    ADD CONSTRAINT "check_item_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifiers"("id") ON DELETE CASCADE;


--
-- Name: check_items check_items_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_items"
    ADD CONSTRAINT "check_items_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE CASCADE;


--
-- Name: check_items check_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_items"
    ADD CONSTRAINT "check_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory"("id") ON DELETE RESTRICT;


--
-- Name: check_payments check_payments_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."check_payments"
    ADD CONSTRAINT "check_payments_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE CASCADE;


--
-- Name: checks checks_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."checks"
    ADD CONSTRAINT "checks_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id");


--
-- Name: checks checks_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."checks"
    ADD CONSTRAINT "checks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;


--
-- Name: checks checks_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."checks"
    ADD CONSTRAINT "checks_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id");


--
-- Name: checks checks_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."checks"
    ADD CONSTRAINT "checks_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id");


--
-- Name: checks checks_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."checks"
    ADD CONSTRAINT "checks_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."profiles"("id");


--
-- Name: client_discount_rules client_discount_rules_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."client_discount_rules"
    ADD CONSTRAINT "client_discount_rules_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE CASCADE;


--
-- Name: client_discount_rules client_discount_rules_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."client_discount_rules"
    ADD CONSTRAINT "client_discount_rules_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory"("id") ON DELETE CASCADE;


--
-- Name: client_discount_rules client_discount_rules_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."client_discount_rules"
    ADD CONSTRAINT "client_discount_rules_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: discounts discounts_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."discounts"
    ADD CONSTRAINT "discounts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory"("id") ON DELETE SET NULL;


--
-- Name: events events_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE SET NULL;


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;


--
-- Name: expenses expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: menu_categories menu_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."menu_categories"("id") ON DELETE SET NULL;


--
-- Name: product_modifiers product_modifiers_modifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_modifiers"
    ADD CONSTRAINT "product_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifiers"("id") ON DELETE CASCADE;


--
-- Name: product_modifiers product_modifiers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_modifiers"
    ADD CONSTRAINT "product_modifiers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."inventory"("id") ON DELETE CASCADE;


--
-- Name: refund_items refund_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."refund_items"
    ADD CONSTRAINT "refund_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory"("id");


--
-- Name: refund_items refund_items_refund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."refund_items"
    ADD CONSTRAINT "refund_items_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE CASCADE;


--
-- Name: refunds refunds_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE RESTRICT;


--
-- Name: refunds refunds_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: refunds refunds_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id");


--
-- Name: revision_items revision_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."revision_items"
    ADD CONSTRAINT "revision_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory"("id") ON DELETE RESTRICT;


--
-- Name: revision_items revision_items_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."revision_items"
    ADD CONSTRAINT "revision_items_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "public"."revisions"("id") ON DELETE CASCADE;


--
-- Name: revisions revisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."revisions"
    ADD CONSTRAINT "revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: salary_payments salary_payments_cash_operation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salary_payments"
    ADD CONSTRAINT "salary_payments_cash_operation_id_fkey" FOREIGN KEY ("cash_operation_id") REFERENCES "public"."cash_operations"("id") ON DELETE SET NULL;


--
-- Name: salary_payments salary_payments_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salary_payments"
    ADD CONSTRAINT "salary_payments_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "public"."profiles"("id");


--
-- Name: salary_payments salary_payments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salary_payments"
    ADD CONSTRAINT "salary_payments_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;


--
-- Name: salary_payments salary_payments_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salary_payments"
    ADD CONSTRAINT "salary_payments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;


--
-- Name: salary_skipped_shifts salary_skipped_shifts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salary_skipped_shifts"
    ADD CONSTRAINT "salary_skipped_shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: salary_skipped_shifts salary_skipped_shifts_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."salary_skipped_shifts"
    ADD CONSTRAINT "salary_skipped_shifts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;


--
-- Name: shifts shifts_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id");


--
-- Name: shifts shifts_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "public"."profiles"("id");


--
-- Name: supplies supplies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: supply_items supply_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."supply_items"
    ADD CONSTRAINT "supply_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory"("id") ON DELETE RESTRICT;


--
-- Name: supply_items supply_items_supply_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."supply_items"
    ADD CONSTRAINT "supply_items_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;


--
-- Name: tg_link_requests tg_link_requests_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tg_link_requests"
    ADD CONSTRAINT "tg_link_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: transactions transactions_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id");


--
-- Name: transactions transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");


--
-- Name: transactions transactions_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory"("id");


--
-- Name: transactions transactions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");


--
-- Name: user_notification_settings user_notification_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_notification_settings"
    ADD CONSTRAINT "user_notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: events Enable all access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all access" ON "public"."events" USING (true);


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: bonus_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bonus_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: bonus_history bonus_history_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bonus_history_all" ON "public"."bonus_history" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings bookings_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bookings_all" ON "public"."bookings" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: cash_operations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cash_operations" ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_operations cash_ops_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cash_ops_delete" ON "public"."cash_operations" FOR DELETE TO "authenticated", "anon" USING (true);


--
-- Name: cash_operations cash_ops_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cash_ops_insert" ON "public"."cash_operations" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: cash_operations cash_ops_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cash_ops_select" ON "public"."cash_operations" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: certificates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."certificates" ENABLE ROW LEVEL SECURITY;

--
-- Name: certificates certificates_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "certificates_all" ON "public"."certificates" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: check_discounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."check_discounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: check_discounts check_discounts_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "check_discounts_all" ON "public"."check_discounts" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: check_item_modifiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."check_item_modifiers" ENABLE ROW LEVEL SECURITY;

--
-- Name: check_item_modifiers check_item_modifiers_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "check_item_modifiers_all" ON "public"."check_item_modifiers" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: check_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."check_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: check_items check_items_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "check_items_delete" ON "public"."check_items" FOR DELETE TO "authenticated", "anon" USING (true);


--
-- Name: check_items check_items_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "check_items_insert" ON "public"."check_items" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: check_items check_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "check_items_select" ON "public"."check_items" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: check_items check_items_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "check_items_update" ON "public"."check_items" FOR UPDATE TO "authenticated", "anon" USING (true);


--
-- Name: check_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."check_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: check_payments check_payments_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "check_payments_all" ON "public"."check_payments" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: checks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."checks" ENABLE ROW LEVEL SECURITY;

--
-- Name: checks checks_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "checks_delete" ON "public"."checks" FOR DELETE TO "authenticated", "anon" USING (true);


--
-- Name: checks checks_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "checks_insert" ON "public"."checks" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: checks checks_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "checks_select" ON "public"."checks" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: checks checks_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "checks_update" ON "public"."checks" FOR UPDATE TO "authenticated", "anon" USING (true);


--
-- Name: client_discount_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."client_discount_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_discount_rules client_discount_rules_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "client_discount_rules_all" ON "public"."client_discount_rules" USING (true) WITH CHECK (true);


--
-- Name: discounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."discounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: discounts discounts_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "discounts_all" ON "public"."discounts" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "expenses_all" ON "public"."expenses" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: inventory; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory inventory_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inventory_delete" ON "public"."inventory" FOR DELETE TO "authenticated", "anon" USING (true);


--
-- Name: inventory inventory_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inventory_insert" ON "public"."inventory" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: inventory inventory_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inventory_select" ON "public"."inventory" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: inventory inventory_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inventory_update" ON "public"."inventory" FOR UPDATE TO "authenticated", "anon" USING (true);


--
-- Name: menu_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."menu_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories menu_categories_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "menu_categories_all" ON "public"."menu_categories" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: modifiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."modifiers" ENABLE ROW LEVEL SECURITY;

--
-- Name: modifiers modifiers_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "modifiers_all" ON "public"."modifiers" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notifications_insert" ON "public"."notifications" FOR INSERT WITH CHECK (true);


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT USING (true);


--
-- Name: product_modifiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_modifiers" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_modifiers product_modifiers_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "product_modifiers_all" ON "public"."product_modifiers" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE TO "authenticated", "anon" USING (true);


--
-- Name: refund_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."refund_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: refund_items refund_items_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "refund_items_all" ON "public"."refund_items" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: refunds; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds refunds_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "refunds_all" ON "public"."refunds" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: revision_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."revision_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: revision_items revision_items_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "revision_items_insert" ON "public"."revision_items" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: revision_items revision_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "revision_items_select" ON "public"."revision_items" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: revisions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."revisions" ENABLE ROW LEVEL SECURITY;

--
-- Name: revisions revisions_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "revisions_delete" ON "public"."revisions" FOR DELETE TO "authenticated", "anon" USING (true);


--
-- Name: revisions revisions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "revisions_insert" ON "public"."revisions" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: revisions revisions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "revisions_select" ON "public"."revisions" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: revisions revisions_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "revisions_update" ON "public"."revisions" FOR UPDATE TO "authenticated", "anon" USING (true);


--
-- Name: salary_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."salary_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: salary_payments salary_payments_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "salary_payments_all" ON "public"."salary_payments" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: salary_skipped_shifts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."salary_skipped_shifts" ENABLE ROW LEVEL SECURITY;

--
-- Name: salary_skipped_shifts salary_skipped_shifts_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "salary_skipped_shifts_all" ON "public"."salary_skipped_shifts" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: app_settings settings_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "settings_insert" ON "public"."app_settings" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: app_settings settings_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "settings_select" ON "public"."app_settings" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: app_settings settings_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "settings_update" ON "public"."app_settings" FOR UPDATE TO "authenticated", "anon" USING (true);


--
-- Name: shifts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts shifts_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "shifts_delete" ON "public"."shifts" FOR DELETE TO "authenticated", "anon" USING (true);


--
-- Name: shifts shifts_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "shifts_insert" ON "public"."shifts" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: shifts shifts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "shifts_select" ON "public"."shifts" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: shifts shifts_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "shifts_update" ON "public"."shifts" FOR UPDATE TO "authenticated", "anon" USING (true);


--
-- Name: spaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."spaces" ENABLE ROW LEVEL SECURITY;

--
-- Name: spaces spaces_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "spaces_all" ON "public"."spaces" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: supplies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."supplies" ENABLE ROW LEVEL SECURITY;

--
-- Name: supplies supplies_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supplies_delete" ON "public"."supplies" FOR DELETE TO "authenticated", "anon" USING (true);


--
-- Name: supplies supplies_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supplies_insert" ON "public"."supplies" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: supplies supplies_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supplies_select" ON "public"."supplies" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: supplies supplies_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supplies_update" ON "public"."supplies" FOR UPDATE TO "authenticated", "anon" USING (true);


--
-- Name: supply_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."supply_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: supply_items supply_items_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supply_items_delete" ON "public"."supply_items" FOR DELETE TO "authenticated", "anon" USING (true);


--
-- Name: supply_items supply_items_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supply_items_insert" ON "public"."supply_items" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: supply_items supply_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supply_items_select" ON "public"."supply_items" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: supply_items supply_items_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supply_items_update" ON "public"."supply_items" FOR UPDATE TO "authenticated", "anon" USING (true);


--
-- Name: tg_link_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tg_link_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: tg_link_requests tg_link_requests_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tg_link_requests_all" ON "public"."tg_link_requests" TO "authenticated", "anon" USING (true) WITH CHECK (true);


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "transactions_insert" ON "public"."transactions" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: transactions transactions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "transactions_select" ON "public"."transactions" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
-- Skipped: Supabase already creates these publications. Only ADD TABLE is needed.
--

--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: supabase_admin
-- Skipped: Supabase already creates this publication.
--

--
-- Name: supabase_realtime bookings; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bookings";


--
-- Name: supabase_realtime cash_operations; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cash_operations";


--
-- Name: supabase_realtime check_discounts; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."check_discounts";


--
-- Name: supabase_realtime check_items; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."check_items";


--
-- Name: supabase_realtime checks; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."checks";


--
-- Name: supabase_realtime client_discount_rules; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."client_discount_rules";


--
-- Name: supabase_realtime discounts; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."discounts";


--
-- Name: supabase_realtime events; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."events";


--
-- Name: supabase_realtime expenses; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."expenses";


--
-- Name: supabase_realtime inventory; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory";


--
-- Name: supabase_realtime menu_categories; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."menu_categories";


--
-- Name: supabase_realtime modifiers; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."modifiers";


--
-- Name: supabase_realtime notifications; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";


--
-- Name: supabase_realtime profiles; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";


--
-- Name: supabase_realtime refunds; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."refunds";


--
-- Name: supabase_realtime revisions; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."revisions";


--
-- Name: supabase_realtime salary_payments; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."salary_payments";


--
-- Name: supabase_realtime salary_skipped_shifts; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."salary_skipped_shifts";


--
-- Name: supabase_realtime shifts; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."shifts";


--
-- Name: supabase_realtime supplies; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."supplies";


--
-- Name: supabase_realtime tg_link_requests; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tg_link_requests";


--
-- Name: supabase_realtime user_notification_settings; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_notification_settings";


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "armor"("bytea"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."armor"("bytea") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."armor"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."armor"("bytea") TO "dashboard_user";


--
-- Name: FUNCTION "armor"("bytea", "text"[], "text"[]); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."armor"("bytea", "text"[], "text"[]) FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."armor"("bytea", "text"[], "text"[]) TO "postgres";
GRANT ALL ON FUNCTION "extensions"."armor"("bytea", "text"[], "text"[]) TO "dashboard_user";


--
-- Name: FUNCTION "crypt"("text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."crypt"("text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."crypt"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."crypt"("text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "dearmor"("text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."dearmor"("text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."dearmor"("text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."dearmor"("text") TO "dashboard_user";


--
-- Name: FUNCTION "decrypt"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."decrypt"("bytea", "bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."decrypt"("bytea", "bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."decrypt"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "decrypt_iv"("bytea", "bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."decrypt_iv"("bytea", "bytea", "bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."decrypt_iv"("bytea", "bytea", "bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."decrypt_iv"("bytea", "bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "digest"("bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."digest"("bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."digest"("bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."digest"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "digest"("text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."digest"("text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."digest"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."digest"("text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "encrypt"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."encrypt"("bytea", "bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."encrypt"("bytea", "bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."encrypt"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "encrypt_iv"("bytea", "bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."encrypt_iv"("bytea", "bytea", "bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."encrypt_iv"("bytea", "bytea", "bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."encrypt_iv"("bytea", "bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "gen_random_bytes"(integer); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."gen_random_bytes"(integer) FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."gen_random_bytes"(integer) TO "postgres";
GRANT ALL ON FUNCTION "extensions"."gen_random_bytes"(integer) TO "dashboard_user";


--
-- Name: FUNCTION "gen_random_uuid"(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."gen_random_uuid"() FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."gen_random_uuid"() TO "postgres";
GRANT ALL ON FUNCTION "extensions"."gen_random_uuid"() TO "dashboard_user";


--
-- Name: FUNCTION "gen_salt"("text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."gen_salt"("text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."gen_salt"("text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."gen_salt"("text") TO "dashboard_user";


--
-- Name: FUNCTION "gen_salt"("text", integer); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."gen_salt"("text", integer) FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."gen_salt"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "extensions"."gen_salt"("text", integer) TO "dashboard_user";


--
-- Name: FUNCTION "hmac"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."hmac"("bytea", "bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."hmac"("bytea", "bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."hmac"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "hmac"("text", "text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."hmac"("text", "text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."hmac"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."hmac"("text", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pg_stat_statements"("showtext" boolean, OUT "userid" "oid", OUT "dbid" "oid", OUT "toplevel" boolean, OUT "queryid" bigint, OUT "query" "text", OUT "plans" bigint, OUT "total_plan_time" double precision, OUT "min_plan_time" double precision, OUT "max_plan_time" double precision, OUT "mean_plan_time" double precision, OUT "stddev_plan_time" double precision, OUT "calls" bigint, OUT "total_exec_time" double precision, OUT "min_exec_time" double precision, OUT "max_exec_time" double precision, OUT "mean_exec_time" double precision, OUT "stddev_exec_time" double precision, OUT "rows" bigint, OUT "shared_blks_hit" bigint, OUT "shared_blks_read" bigint, OUT "shared_blks_dirtied" bigint, OUT "shared_blks_written" bigint, OUT "local_blks_hit" bigint, OUT "local_blks_read" bigint, OUT "local_blks_dirtied" bigint, OUT "local_blks_written" bigint, OUT "temp_blks_read" bigint, OUT "temp_blks_written" bigint, OUT "shared_blk_read_time" double precision, OUT "shared_blk_write_time" double precision, OUT "local_blk_read_time" double precision, OUT "local_blk_write_time" double precision, OUT "temp_blk_read_time" double precision, OUT "temp_blk_write_time" double precision, OUT "wal_records" bigint, OUT "wal_fpi" bigint, OUT "wal_bytes" numeric, OUT "jit_functions" bigint, OUT "jit_generation_time" double precision, OUT "jit_inlining_count" bigint, OUT "jit_inlining_time" double precision, OUT "jit_optimization_count" bigint, OUT "jit_optimization_time" double precision, OUT "jit_emission_count" bigint, OUT "jit_emission_time" double precision, OUT "jit_deform_count" bigint, OUT "jit_deform_time" double precision, OUT "stats_since" timestamp with time zone, OUT "minmax_stats_since" timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pg_stat_statements"("showtext" boolean, OUT "userid" "oid", OUT "dbid" "oid", OUT "toplevel" boolean, OUT "queryid" bigint, OUT "query" "text", OUT "plans" bigint, OUT "total_plan_time" double precision, OUT "min_plan_time" double precision, OUT "max_plan_time" double precision, OUT "mean_plan_time" double precision, OUT "stddev_plan_time" double precision, OUT "calls" bigint, OUT "total_exec_time" double precision, OUT "min_exec_time" double precision, OUT "max_exec_time" double precision, OUT "mean_exec_time" double precision, OUT "stddev_exec_time" double precision, OUT "rows" bigint, OUT "shared_blks_hit" bigint, OUT "shared_blks_read" bigint, OUT "shared_blks_dirtied" bigint, OUT "shared_blks_written" bigint, OUT "local_blks_hit" bigint, OUT "local_blks_read" bigint, OUT "local_blks_dirtied" bigint, OUT "local_blks_written" bigint, OUT "temp_blks_read" bigint, OUT "temp_blks_written" bigint, OUT "shared_blk_read_time" double precision, OUT "shared_blk_write_time" double precision, OUT "local_blk_read_time" double precision, OUT "local_blk_write_time" double precision, OUT "temp_blk_read_time" double precision, OUT "temp_blk_write_time" double precision, OUT "wal_records" bigint, OUT "wal_fpi" bigint, OUT "wal_bytes" numeric, OUT "jit_functions" bigint, OUT "jit_generation_time" double precision, OUT "jit_inlining_count" bigint, OUT "jit_inlining_time" double precision, OUT "jit_optimization_count" bigint, OUT "jit_optimization_time" double precision, OUT "jit_emission_count" bigint, OUT "jit_emission_time" double precision, OUT "jit_deform_count" bigint, OUT "jit_deform_time" double precision, OUT "stats_since" timestamp with time zone, OUT "minmax_stats_since" timestamp with time zone) FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pg_stat_statements"("showtext" boolean, OUT "userid" "oid", OUT "dbid" "oid", OUT "toplevel" boolean, OUT "queryid" bigint, OUT "query" "text", OUT "plans" bigint, OUT "total_plan_time" double precision, OUT "min_plan_time" double precision, OUT "max_plan_time" double precision, OUT "mean_plan_time" double precision, OUT "stddev_plan_time" double precision, OUT "calls" bigint, OUT "total_exec_time" double precision, OUT "min_exec_time" double precision, OUT "max_exec_time" double precision, OUT "mean_exec_time" double precision, OUT "stddev_exec_time" double precision, OUT "rows" bigint, OUT "shared_blks_hit" bigint, OUT "shared_blks_read" bigint, OUT "shared_blks_dirtied" bigint, OUT "shared_blks_written" bigint, OUT "local_blks_hit" bigint, OUT "local_blks_read" bigint, OUT "local_blks_dirtied" bigint, OUT "local_blks_written" bigint, OUT "temp_blks_read" bigint, OUT "temp_blks_written" bigint, OUT "shared_blk_read_time" double precision, OUT "shared_blk_write_time" double precision, OUT "local_blk_read_time" double precision, OUT "local_blk_write_time" double precision, OUT "temp_blk_read_time" double precision, OUT "temp_blk_write_time" double precision, OUT "wal_records" bigint, OUT "wal_fpi" bigint, OUT "wal_bytes" numeric, OUT "jit_functions" bigint, OUT "jit_generation_time" double precision, OUT "jit_inlining_count" bigint, OUT "jit_inlining_time" double precision, OUT "jit_optimization_count" bigint, OUT "jit_optimization_time" double precision, OUT "jit_emission_count" bigint, OUT "jit_emission_time" double precision, OUT "jit_deform_count" bigint, OUT "jit_deform_time" double precision, OUT "stats_since" timestamp with time zone, OUT "minmax_stats_since" timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pg_stat_statements"("showtext" boolean, OUT "userid" "oid", OUT "dbid" "oid", OUT "toplevel" boolean, OUT "queryid" bigint, OUT "query" "text", OUT "plans" bigint, OUT "total_plan_time" double precision, OUT "min_plan_time" double precision, OUT "max_plan_time" double precision, OUT "mean_plan_time" double precision, OUT "stddev_plan_time" double precision, OUT "calls" bigint, OUT "total_exec_time" double precision, OUT "min_exec_time" double precision, OUT "max_exec_time" double precision, OUT "mean_exec_time" double precision, OUT "stddev_exec_time" double precision, OUT "rows" bigint, OUT "shared_blks_hit" bigint, OUT "shared_blks_read" bigint, OUT "shared_blks_dirtied" bigint, OUT "shared_blks_written" bigint, OUT "local_blks_hit" bigint, OUT "local_blks_read" bigint, OUT "local_blks_dirtied" bigint, OUT "local_blks_written" bigint, OUT "temp_blks_read" bigint, OUT "temp_blks_written" bigint, OUT "shared_blk_read_time" double precision, OUT "shared_blk_write_time" double precision, OUT "local_blk_read_time" double precision, OUT "local_blk_write_time" double precision, OUT "temp_blk_read_time" double precision, OUT "temp_blk_write_time" double precision, OUT "wal_records" bigint, OUT "wal_fpi" bigint, OUT "wal_bytes" numeric, OUT "jit_functions" bigint, OUT "jit_generation_time" double precision, OUT "jit_inlining_count" bigint, OUT "jit_inlining_time" double precision, OUT "jit_optimization_count" bigint, OUT "jit_optimization_time" double precision, OUT "jit_emission_count" bigint, OUT "jit_emission_time" double precision, OUT "jit_deform_count" bigint, OUT "jit_deform_time" double precision, OUT "stats_since" timestamp with time zone, OUT "minmax_stats_since" timestamp with time zone) TO "dashboard_user";


--
-- Name: FUNCTION "pg_stat_statements_info"(OUT "dealloc" bigint, OUT "stats_reset" timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pg_stat_statements_info"(OUT "dealloc" bigint, OUT "stats_reset" timestamp with time zone) FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pg_stat_statements_info"(OUT "dealloc" bigint, OUT "stats_reset" timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pg_stat_statements_info"(OUT "dealloc" bigint, OUT "stats_reset" timestamp with time zone) TO "dashboard_user";


--
-- Name: FUNCTION "pg_stat_statements_reset"("userid" "oid", "dbid" "oid", "queryid" bigint, "minmax_only" boolean); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pg_stat_statements_reset"("userid" "oid", "dbid" "oid", "queryid" bigint, "minmax_only" boolean) FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pg_stat_statements_reset"("userid" "oid", "dbid" "oid", "queryid" bigint, "minmax_only" boolean) TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pg_stat_statements_reset"("userid" "oid", "dbid" "oid", "queryid" bigint, "minmax_only" boolean) TO "dashboard_user";


--
-- Name: FUNCTION "pgp_armor_headers"("text", OUT "key" "text", OUT "value" "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_armor_headers"("text", OUT "key" "text", OUT "value" "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_armor_headers"("text", OUT "key" "text", OUT "value" "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_armor_headers"("text", OUT "key" "text", OUT "value" "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_key_id"("bytea"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_key_id"("bytea") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_key_id"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_key_id"("bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt"("bytea", "bytea"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt"("bytea", "bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt_bytea"("bytea", "bytea"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt_bytea"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt_bytea"("bytea", "bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt"("text", "bytea"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt"("text", "bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt_bytea"("bytea", "bytea"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt_bytea"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt"("bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt"("bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt_bytea"("bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt_bytea"("bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt"("text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt"("text", "text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt_bytea"("bytea", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt_bytea"("bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text", "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v1"(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_generate_v1"() FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v1"() TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v1"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v1mc"(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_generate_v1mc"() FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v1mc"() TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v1mc"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v3"("namespace" "uuid", "name" "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_generate_v3"("namespace" "uuid", "name" "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v3"("namespace" "uuid", "name" "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v3"("namespace" "uuid", "name" "text") TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v4"(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_generate_v4"() FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v4"() TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v4"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v5"("namespace" "uuid", "name" "text"); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_generate_v5"("namespace" "uuid", "name" "text") FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v5"("namespace" "uuid", "name" "text") TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_generate_v5"("namespace" "uuid", "name" "text") TO "dashboard_user";


--
-- Name: FUNCTION "uuid_nil"(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_nil"() FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_nil"() TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_nil"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_dns"(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_ns_dns"() FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_ns_dns"() TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_ns_dns"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_oid"(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_ns_oid"() FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_ns_oid"() TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_ns_oid"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_url"(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_ns_url"() FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_ns_url"() TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_ns_url"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_x500"(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION "extensions"."uuid_ns_x500"() FROM "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_ns_x500"() TO "postgres";
GRANT ALL ON FUNCTION "extensions"."uuid_ns_x500"() TO "dashboard_user";


--
-- Name: FUNCTION "graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb"); Type: ACL; Schema: graphql_public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "graphql_public"."graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "graphql_public"."graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "graphql_public"."graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "graphql_public"."graphql"("operationName" "text", "query" "text", "variables" "jsonb", "extensions" "jsonb") TO "service_role";


--
-- Name: FUNCTION "decrement_stock"("p_item_id" "uuid", "p_qty" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."decrement_stock"("p_item_id" "uuid", "p_qty" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_stock"("p_item_id" "uuid", "p_qty" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_stock"("p_item_id" "uuid", "p_qty" numeric) TO "service_role";


--
-- Name: FUNCTION "increment_stock"("p_item_id" "uuid", "p_qty" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."increment_stock"("p_item_id" "uuid", "p_qty" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_stock"("p_item_id" "uuid", "p_qty" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_stock"("p_item_id" "uuid", "p_qty" numeric) TO "service_role";


--
-- Name: FUNCTION "update_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: FUNCTION "_crypto_aead_det_decrypt"("message" "bytea", "additional" "bytea", "key_id" bigint, "context" "bytea", "nonce" "bytea"); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "vault"."_crypto_aead_det_decrypt"("message" "bytea", "additional" "bytea", "key_id" bigint, "context" "bytea", "nonce" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "vault"."_crypto_aead_det_decrypt"("message" "bytea", "additional" "bytea", "key_id" bigint, "context" "bytea", "nonce" "bytea") TO "service_role";


--
-- Name: FUNCTION "create_secret"("new_secret" "text", "new_name" "text", "new_description" "text", "new_key_id" "uuid"); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "vault"."create_secret"("new_secret" "text", "new_name" "text", "new_description" "text", "new_key_id" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "vault"."create_secret"("new_secret" "text", "new_name" "text", "new_description" "text", "new_key_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_secret"("secret_id" "uuid", "new_secret" "text", "new_name" "text", "new_description" "text", "new_key_id" "uuid"); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "vault"."update_secret"("secret_id" "uuid", "new_secret" "text", "new_name" "text", "new_description" "text", "new_key_id" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "vault"."update_secret"("secret_id" "uuid", "new_secret" "text", "new_name" "text", "new_description" "text", "new_key_id" "uuid") TO "service_role";


--
-- Name: TABLE "pg_stat_statements"; Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON TABLE "extensions"."pg_stat_statements" FROM "postgres";
GRANT ALL ON TABLE "extensions"."pg_stat_statements" TO "postgres";
GRANT ALL ON TABLE "extensions"."pg_stat_statements" TO "dashboard_user";


--
-- Name: TABLE "pg_stat_statements_info"; Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON TABLE "extensions"."pg_stat_statements_info" FROM "postgres";
GRANT ALL ON TABLE "extensions"."pg_stat_statements_info" TO "postgres";
GRANT ALL ON TABLE "extensions"."pg_stat_statements_info" TO "dashboard_user";


--
-- Name: TABLE "app_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";


--
-- Name: TABLE "bonus_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bonus_history" TO "anon";
GRANT ALL ON TABLE "public"."bonus_history" TO "authenticated";
GRANT ALL ON TABLE "public"."bonus_history" TO "service_role";


--
-- Name: TABLE "bookings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";


--
-- Name: TABLE "cash_operations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cash_operations" TO "anon";
GRANT ALL ON TABLE "public"."cash_operations" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_operations" TO "service_role";


--
-- Name: TABLE "certificates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."certificates" TO "anon";
GRANT ALL ON TABLE "public"."certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."certificates" TO "service_role";


--
-- Name: TABLE "check_discounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."check_discounts" TO "anon";
GRANT ALL ON TABLE "public"."check_discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."check_discounts" TO "service_role";


--
-- Name: TABLE "check_item_modifiers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."check_item_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."check_item_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."check_item_modifiers" TO "service_role";


--
-- Name: TABLE "check_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."check_items" TO "anon";
GRANT ALL ON TABLE "public"."check_items" TO "authenticated";
GRANT ALL ON TABLE "public"."check_items" TO "service_role";


--
-- Name: TABLE "check_payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."check_payments" TO "anon";
GRANT ALL ON TABLE "public"."check_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."check_payments" TO "service_role";


--
-- Name: TABLE "checks"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."checks" TO "anon";
GRANT ALL ON TABLE "public"."checks" TO "authenticated";
GRANT ALL ON TABLE "public"."checks" TO "service_role";


--
-- Name: TABLE "client_discount_rules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."client_discount_rules" TO "anon";
GRANT ALL ON TABLE "public"."client_discount_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."client_discount_rules" TO "service_role";


--
-- Name: TABLE "discounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."discounts" TO "anon";
GRANT ALL ON TABLE "public"."discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."discounts" TO "service_role";


--
-- Name: TABLE "events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";


--
-- Name: TABLE "expenses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";


--
-- Name: TABLE "inventory"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";


--
-- Name: TABLE "menu_categories"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."menu_categories" TO "anon";
GRANT ALL ON TABLE "public"."menu_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_categories" TO "service_role";


--
-- Name: TABLE "modifiers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."modifiers" TO "anon";
GRANT ALL ON TABLE "public"."modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."modifiers" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: TABLE "product_modifiers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."product_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."product_modifiers" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "refund_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."refund_items" TO "anon";
GRANT ALL ON TABLE "public"."refund_items" TO "authenticated";
GRANT ALL ON TABLE "public"."refund_items" TO "service_role";


--
-- Name: TABLE "refunds"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."refunds" TO "anon";
GRANT ALL ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";


--
-- Name: TABLE "revision_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."revision_items" TO "anon";
GRANT ALL ON TABLE "public"."revision_items" TO "authenticated";
GRANT ALL ON TABLE "public"."revision_items" TO "service_role";


--
-- Name: TABLE "revisions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."revisions" TO "anon";
GRANT ALL ON TABLE "public"."revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."revisions" TO "service_role";


--
-- Name: TABLE "salary_payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."salary_payments" TO "anon";
GRANT ALL ON TABLE "public"."salary_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."salary_payments" TO "service_role";


--
-- Name: TABLE "salary_skipped_shifts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."salary_skipped_shifts" TO "anon";
GRANT ALL ON TABLE "public"."salary_skipped_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."salary_skipped_shifts" TO "service_role";


--
-- Name: TABLE "shifts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";


--
-- Name: TABLE "spaces"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."spaces" TO "anon";
GRANT ALL ON TABLE "public"."spaces" TO "authenticated";
GRANT ALL ON TABLE "public"."spaces" TO "service_role";


--
-- Name: TABLE "supplies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."supplies" TO "anon";
GRANT ALL ON TABLE "public"."supplies" TO "authenticated";
GRANT ALL ON TABLE "public"."supplies" TO "service_role";


--
-- Name: TABLE "supply_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."supply_items" TO "anon";
GRANT ALL ON TABLE "public"."supply_items" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_items" TO "service_role";


--
-- Name: TABLE "tg_link_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tg_link_requests" TO "anon";
GRANT ALL ON TABLE "public"."tg_link_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."tg_link_requests" TO "service_role";


--
-- Name: TABLE "transactions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";


--
-- Name: TABLE "user_notification_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notification_settings" TO "service_role";


--
-- Name: TABLE "secrets"; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE "vault"."secrets" TO "postgres";
GRANT SELECT,DELETE ON TABLE "vault"."secrets" TO "service_role";


--
-- Name: TABLE "decrypted_secrets"; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE "vault"."decrypted_secrets" TO "postgres";
GRANT SELECT,DELETE ON TABLE "vault"."decrypted_secrets" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

-- Skipped: ALTER DEFAULT PRIVILEGES requires elevated permissions; Supabase already configures these.


--
-- EVENT TRIGGERS: Supabase создаёт их автоматически, пропускаем.
--
-- PostgreSQL database dump complete
--
