defmodule BackendWeb.Router do
  use BackendWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :authenticated do
    plug BackendWeb.AuthPlug
  end

  # Public auth endpoints
  scope "/api/v1", BackendWeb do
    pipe_through :api

    post "/auth/request-code", AuthController, :request_code
    post "/auth/verify-code", AuthController, :verify_code
    delete "/auth/logout", AuthController, :logout
  end

  # Protected endpoints
  scope "/api/v1", BackendWeb do
    pipe_through [:api, :authenticated]

    get "/me", UserController, :me
  end

  # LiveDashboard + Swoosh mailbox (dev only)
  if Application.compile_env(:backend, :dev_routes) do
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through [:fetch_session, :protect_from_forgery]

      live_dashboard "/dashboard", metrics: BackendWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end

end
