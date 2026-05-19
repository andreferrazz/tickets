defmodule BackendWeb.Router do
  use BackendWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :authenticated do
    plug BackendWeb.AuthPlug
  end

  pipeline :maybe_authenticated do
    plug BackendWeb.MaybeAuthPlug
  end

  pipeline :creator do
    plug BackendWeb.RequireCreatorPlug
  end

  pipeline :admin do
    plug BackendWeb.RequireAdminPlug
  end

  # ---------------------------------------------------------------------------
  # Public auth endpoints (rate-limited in the controller)
  # ---------------------------------------------------------------------------
  scope "/api/v1", BackendWeb do
    pipe_through :api

    post "/auth/request-code", AuthController, :request_code
    post "/auth/verify-code", AuthController, :verify_code
    delete "/auth/logout", AuthController, :logout

    post "/invitations/accept", InvitationController, :accept
  end

  # ---------------------------------------------------------------------------
  # Public event browsing — optional auth so creators can see their own drafts
  # ---------------------------------------------------------------------------
  scope "/api/v1", BackendWeb do
    pipe_through [:api, :maybe_authenticated]

    get "/events", EventController, :index
    get "/events/:id", EventController, :show
    get "/events/:id/seating", EventController, :seating
  end

  # ---------------------------------------------------------------------------
  # Authenticated — any role
  # ---------------------------------------------------------------------------
  scope "/api/v1", BackendWeb do
    pipe_through [:api, :authenticated]

    get "/me", UserController, :me
    get "/me/organizations", UserController, :my_organizations
    patch "/me/profile", UserController, :update_profile

    put "/events/:id", EventController, :update
    delete "/events/:id", EventController, :delete
    get "/events/:id/stats", EventController, :stats

    put "/ticket-types/:id", TicketTypeController, :update
    delete "/ticket-types/:id", TicketTypeController, :delete

    put "/batches/:id", TicketBatchController, :update
    post "/batches/:id/close", TicketBatchController, :close
    delete "/batches/:id", TicketBatchController, :delete

    put "/extras/:id", ExtraItemController, :update
    delete "/extras/:id", ExtraItemController, :delete
    get "/extras/:id/buyers", ExtraItemController, :buyers

    put "/extra-sections/:id", ExtraItemSectionController, :update
    delete "/extra-sections/:id", ExtraItemSectionController, :delete

    put "/seat-tables/:id", SeatTableController, :update
    delete "/seat-tables/:id", SeatTableController, :delete

    post "/orders", OrderController, :create
    get "/orders", OrderController, :index
    get "/orders/:id", OrderController, :show
    get "/orders/:id/passes", OrderController, :passes

    post "/passes/validate", PassController, :validate

    patch "/organizations/:id", OrganizationController, :update
    delete "/organizations/:id", OrganizationController, :delete
  end

  # ---------------------------------------------------------------------------
  # Authenticated — creator/admin only
  # ---------------------------------------------------------------------------
  scope "/api/v1", BackendWeb do
    pipe_through [:api, :authenticated, :creator]

    post "/events", EventController, :create
    post "/events/:event_id/ticket-types", TicketTypeController, :create
    post "/ticket-types/:ticket_type_id/batches", TicketBatchController, :create
    post "/events/:event_id/extras", ExtraItemController, :create
    post "/events/:event_id/extra-sections", ExtraItemSectionController, :create
    post "/events/:event_id/seat-tables", SeatTableController, :create

    # Invitations: admins create new orgs with leader invites; leaders invite
    # participants to their existing org. Buyer-only and participant-only users
    # are rejected by the Invitations context with :forbidden.
    post "/invitations", InvitationController, :create
    get "/invitations", InvitationController, :index
  end

  # ---------------------------------------------------------------------------
  # Webhooks — no session auth, HMAC validated in controller
  # ---------------------------------------------------------------------------
  scope "/webhooks", BackendWeb do
    pipe_through :api

    post "/abacate-pay", WebhookController, :abacate_pay
  end

  # ---------------------------------------------------------------------------
  # Dev tooling
  # ---------------------------------------------------------------------------
  if Application.compile_env(:backend, :dev_routes) do
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through [:fetch_session, :protect_from_forgery]

      live_dashboard "/dashboard", metrics: BackendWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
