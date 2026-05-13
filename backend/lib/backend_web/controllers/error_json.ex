defmodule BackendWeb.ErrorJSON do
  @moduledoc """
  Renders JSON error responses for the API.

  Phoenix dispatches here for any unhandled exception once `debug_errors` is
  off. We must never leak DB column/constraint names or stack traces — every
  branch below returns a generic, client-safe message.
  """

  # Constraint violations escape from `Repo.*!` calls or from changesets that
  # forgot the matching `*_constraint`. Render as 409 with a generic detail
  # so the offending constraint name never reaches the client.
  def render("409.json", %{reason: %Ecto.ConstraintError{}}) do
    %{errors: %{detail: "Resource conflict"}}
  end

  def render(template, _assigns) do
    %{errors: %{detail: Phoenix.Controller.status_message_from_template(template)}}
  end
end

# Map Ecto.ConstraintError to 409 Conflict so Phoenix renders it via the
# 409.json clause above. Default Plug.Exception status for this error is 500.
defimpl Plug.Exception, for: Ecto.ConstraintError do
  def status(_exception), do: 409
  def actions(_exception), do: []
end
