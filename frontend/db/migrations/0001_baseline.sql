-- 0001_baseline.sql
--
-- The schema as Phoenix left it after its last Ecto migration (20261006000000),
-- captured with `pg_dump --schema-only --no-owner --no-privileges` on 2026-10-06
-- and edited only to drop psql meta-commands and the search_path reset.
-- From here on the schema is owned by frontend/db/migrations; the Ecto
-- migrations under backend/priv/repo/migrations are frozen.
--
-- A database Phoenix already built is not re-created: db/migrate.ts records this
-- file as applied when it finds Ecto's schema_migrations table (see there).
--

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    code character varying(6) NOT NULL,
    expires_at timestamp(0) without time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    location character varying(255),
    starts_at timestamp(0) without time zone NOT NULL,
    ends_at timestamp(0) without time zone,
    cover_image_url text,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    deleted_at timestamp without time zone,
    tickets_description text,
    organization_id uuid NOT NULL,
    created_by_id uuid
);


--
-- Name: extra_item_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extra_item_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    deleted_at timestamp without time zone,
    inserted_at timestamp(0) without time zone NOT NULL
);


--
-- Name: extra_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extra_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price_cents integer NOT NULL,
    quantity_total integer,
    quantity_sold integer DEFAULT 0 NOT NULL,
    abacate_product_id character varying(255),
    inserted_at timestamp(0) without time zone NOT NULL,
    deleted_at timestamp without time zone,
    section_id uuid NOT NULL,
    show_remaining boolean DEFAULT false NOT NULL,
    limit_to_ticket_count boolean DEFAULT false NOT NULL
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inviter_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    token character varying(64) NOT NULL,
    expires_at timestamp(0) without time zone NOT NULL,
    organization_id uuid NOT NULL,
    role character varying(20) NOT NULL,
    CONSTRAINT invitation_role_must_be_valid CHECK (((role)::text = ANY ((ARRAY['leader'::character varying, 'participant'::character varying, 'staff'::character varying])::text[]))),
    CONSTRAINT invitation_status_must_be_valid CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    item_type character varying(20) NOT NULL,
    item_id uuid NOT NULL,
    item_name character varying(255) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_cents integer NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    batch_id uuid
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    total_cents integer NOT NULL,
    abacate_checkout_id character varying(255),
    abacate_payment_url text,
    paid_at timestamp(0) without time zone,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    payment_method character varying(255),
    card_installments integer,
    platform_fee_cents integer,
    expires_at timestamp(0) without time zone
);


--
-- Name: organization_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(20) NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    CONSTRAINT role_must_be_valid CHECK (((role)::text = ANY ((ARRAY['leader'::character varying, 'participant'::character varying, 'staff'::character varying])::text[])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    pix_key character varying(255),
    pix_key_type character varying(10),
    CONSTRAINT pix_key_pair_consistency CHECK ((((pix_key IS NULL) AND (pix_key_type IS NULL)) OR ((pix_key IS NOT NULL) AND (pix_key_type IS NOT NULL)))),
    CONSTRAINT pix_key_type_valid CHECK (((pix_key_type IS NULL) OR ((pix_key_type)::text = ANY ((ARRAY['cpf'::character varying, 'cnpj'::character varying, 'email'::character varying, 'phone'::character varying, 'evp'::character varying])::text[]))))
);


--
-- Name: passes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token character varying(64) NOT NULL,
    kind character varying(20) NOT NULL,
    order_id uuid NOT NULL,
    order_item_id uuid,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    item_name character varying(255) NOT NULL,
    checked_in_at timestamp(0) without time zone,
    checked_in_by_user_id uuid,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL
);


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payouts (
    id uuid NOT NULL,
    event_id uuid NOT NULL,
    requested_by_id uuid,
    amount_cents integer NOT NULL,
    pix_key character varying(255) NOT NULL,
    pix_key_type character varying(10) NOT NULL,
    external_id character varying(255) NOT NULL,
    abacate_payout_id character varying(255),
    status character varying(20) NOT NULL,
    error_message text,
    receipt_url character varying(255),
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    CONSTRAINT amount_cents_within_limits CHECK (((amount_cents > 0) AND (amount_cents <= 500000))),
    CONSTRAINT pix_key_type_valid CHECK (((pix_key_type)::text = ANY ((ARRAY['cpf'::character varying, 'cnpj'::character varying, 'email'::character varying, 'phone'::character varying, 'evp'::character varying])::text[]))),
    CONSTRAINT status_valid CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'complete'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'refunded'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp(0) without time zone NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL
);


--
-- Name: ticket_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_type_id uuid NOT NULL,
    sequence integer NOT NULL,
    price_cents integer NOT NULL,
    quantity_total integer NOT NULL,
    quantity_sold integer DEFAULT 0 NOT NULL,
    closed_at timestamp(0) without time zone,
    auto_closed boolean DEFAULT false NOT NULL,
    abacate_product_id character varying(255),
    inserted_at timestamp(0) without time zone NOT NULL
);


--
-- Name: ticket_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    sales_start timestamp(0) without time zone,
    sales_end timestamp(0) without time zone,
    inserted_at timestamp(0) without time zone NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'buyer'::character varying NOT NULL,
    invited_by uuid,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    name character varying(255),
    cellphone character varying(32),
    tax_id character varying(32),
    abacate_customer_id character varying(64)
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(50),
    payload jsonb NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL
);


--
-- Name: auth_codes auth_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_codes
    ADD CONSTRAINT auth_codes_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: extra_item_sections extra_item_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_item_sections
    ADD CONSTRAINT extra_item_sections_pkey PRIMARY KEY (id);


--
-- Name: extra_items extra_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_items
    ADD CONSTRAINT extra_items_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: passes passes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: ticket_batches ticket_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_batches
    ADD CONSTRAINT ticket_batches_pkey PRIMARY KEY (id);


--
-- Name: ticket_types ticket_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: auth_codes_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_codes_email_index ON public.auth_codes USING btree (email);


--
-- Name: events_created_by_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_created_by_id_index ON public.events USING btree (created_by_id);


--
-- Name: events_organization_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_organization_id_index ON public.events USING btree (organization_id);


--
-- Name: events_starts_at_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_starts_at_active_index ON public.events USING btree (starts_at) WHERE (deleted_at IS NULL);


--
-- Name: events_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_status_index ON public.events USING btree (status);


--
-- Name: extra_item_sections_event_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_item_sections_event_id_index ON public.extra_item_sections USING btree (event_id);


--
-- Name: extra_item_sections_event_id_position_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_item_sections_event_id_position_index ON public.extra_item_sections USING btree (event_id, "position");


--
-- Name: extra_items_event_id_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_items_event_id_active_index ON public.extra_items USING btree (event_id) WHERE (deleted_at IS NULL);


--
-- Name: extra_items_event_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_items_event_id_index ON public.extra_items USING btree (event_id);


--
-- Name: extra_items_section_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_items_section_id_index ON public.extra_items USING btree (section_id);


--
-- Name: invitations_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_email_index ON public.invitations USING btree (email);


--
-- Name: invitations_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_expires_at_index ON public.invitations USING btree (expires_at);


--
-- Name: invitations_inviter_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_inviter_id_index ON public.invitations USING btree (inviter_id);


--
-- Name: invitations_organization_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_organization_id_index ON public.invitations USING btree (organization_id);


--
-- Name: invitations_token_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invitations_token_index ON public.invitations USING btree (token);


--
-- Name: order_items_order_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_order_id_index ON public.order_items USING btree (order_id);


--
-- Name: orders_abacate_checkout_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_abacate_checkout_id_index ON public.orders USING btree (abacate_checkout_id);


--
-- Name: orders_event_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_event_id_index ON public.orders USING btree (event_id);


--
-- Name: orders_status_inserted_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_status_inserted_at_index ON public.orders USING btree (status, inserted_at);


--
-- Name: orders_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_user_id_index ON public.orders USING btree (user_id);


--
-- Name: organization_memberships_one_leader_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_memberships_one_leader_index ON public.organization_memberships USING btree (organization_id) WHERE ((role)::text = 'leader'::text);


--
-- Name: organization_memberships_organization_id_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_memberships_organization_id_user_id_index ON public.organization_memberships USING btree (organization_id, user_id);


--
-- Name: organization_memberships_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_user_id_index ON public.organization_memberships USING btree (user_id);


--
-- Name: passes_event_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX passes_event_id_index ON public.passes USING btree (event_id);


--
-- Name: passes_one_extra_per_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX passes_one_extra_per_order ON public.passes USING btree (order_id) WHERE ((kind)::text = 'extra'::text);


--
-- Name: passes_order_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX passes_order_id_index ON public.passes USING btree (order_id);


--
-- Name: passes_token_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX passes_token_index ON public.passes USING btree (token);


--
-- Name: payouts_abacate_payout_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payouts_abacate_payout_id_index ON public.payouts USING btree (abacate_payout_id);


--
-- Name: payouts_event_id_inserted_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payouts_event_id_inserted_at_index ON public.payouts USING btree (event_id, inserted_at);


--
-- Name: payouts_external_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payouts_external_id_index ON public.payouts USING btree (external_id);


--
-- Name: sessions_token_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_token_index ON public.sessions USING btree (token);


--
-- Name: sessions_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_index ON public.sessions USING btree (user_id);


--
-- Name: ticket_batches_ticket_type_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_batches_ticket_type_id_index ON public.ticket_batches USING btree (ticket_type_id);


--
-- Name: ticket_batches_ticket_type_id_sequence_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ticket_batches_ticket_type_id_sequence_index ON public.ticket_batches USING btree (ticket_type_id, sequence);


--
-- Name: ticket_types_event_id_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_types_event_id_active_index ON public.ticket_types USING btree (event_id) WHERE (deleted_at IS NULL);


--
-- Name: ticket_types_event_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_types_event_id_index ON public.ticket_types USING btree (event_id);


--
-- Name: users_abacate_customer_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_abacate_customer_id_index ON public.users USING btree (abacate_customer_id) WHERE (abacate_customer_id IS NOT NULL);


--
-- Name: users_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_index ON public.users USING btree (email);


--
-- Name: webhook_events_event_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_event_type_index ON public.webhook_events USING btree (event_type);


--
-- Name: webhook_events_inserted_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_inserted_at_index ON public.webhook_events USING btree (inserted_at);


--
-- Name: events events_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: events events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: extra_item_sections extra_item_sections_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_item_sections
    ADD CONSTRAINT extra_item_sections_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: extra_items extra_items_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_items
    ADD CONSTRAINT extra_items_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: extra_items extra_items_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_items
    ADD CONSTRAINT extra_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.extra_item_sections(id) ON DELETE RESTRICT;


--
-- Name: invitations invitations_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invitations invitations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: organization_memberships organization_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: passes passes_checked_in_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_checked_in_by_user_id_fkey FOREIGN KEY (checked_in_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: passes passes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: passes passes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: passes passes_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;


--
-- Name: passes passes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payouts payouts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: payouts payouts_requested_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_requested_by_id_fkey FOREIGN KEY (requested_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ticket_batches ticket_batches_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_batches
    ADD CONSTRAINT ticket_batches_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE CASCADE;


--
-- Name: ticket_types ticket_types_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: users users_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

--
-- Mark every frozen Ecto migration as applied so `mix ecto.migrate` on a
-- database built from this file is a no-op instead of a re-run.
--
INSERT INTO public.schema_migrations (version, inserted_at) VALUES
    (20260513010017, now()),
    (20260513010018, now()),
    (20260513010019, now()),
    (20260513010545, now()),
    (20260513020000, now()),
    (20260513020001, now()),
    (20260513020002, now()),
    (20260513030000, now()),
    (20260513030001, now()),
    (20260513040000, now()),
    (20260513050000, now()),
    (20260515000000, now()),
    (20260515010000, now()),
    (20260518000000, now()),
    (20260518000001, now()),
    (20260519000000, now()),
    (20260519015431, now()),
    (20260520000000, now()),
    (20260520000001, now()),
    (20260520000002, now()),
    (20260521000000, now()),
    (20260521000001, now()),
    (20260521000002, now()),
    (20260521000003, now()),
    (20260521000004, now()),
    (20260522000000, now()),
    (20260522000001, now()),
    (20260523000000, now()),
    (20260523000001, now()),
    (20260523000002, now()),
    (20260523000003, now()),
    (20260524000000, now()),
    (20260524000001, now()),
    (20260614000000, now()),
    (20260618000000, now()),
    (20261006000000, now());
