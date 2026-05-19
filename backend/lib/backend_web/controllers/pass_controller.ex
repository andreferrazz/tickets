defmodule BackendWeb.PassController do
  use BackendWeb, :controller

  alias Backend.Events.Event
  alias Backend.Repo
  alias Backend.Tickets

  @doc """
  POST /api/v1/passes/validate

  Body: `{"token": "<qr token>"}`. Allowed for the event creator or an admin.
  Idempotent: subsequent scans return `status: "already_checked_in"` with the
  original `checked_in_at`.
  """
  def validate(conn, %{"token" => token}) when is_binary(token) do
    user = conn.assigns.current_user

    with {:ok, pass} <- Tickets.fetch_by_token(token),
         :ok <- authorize(user, pass) do
      {:ok, pass, status} = Tickets.check_in(pass, user)

      conn
      |> put_status(:ok)
      |> json(%{status: Atom.to_string(status), pass: pass_json(pass)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "pass not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "not authorized for this event"})
    end
  end

  def validate(conn, _),
    do: conn |> put_status(:bad_request) |> json(%{error: "token required"})

  defp authorize(%{role: "admin"}, _pass), do: :ok

  defp authorize(user, pass) do
    case Repo.get(Event, pass.event_id) do
      %Event{organization_id: org_id} ->
        if Backend.Organizations.member?(user.id, org_id),
          do: :ok,
          else: {:error, :forbidden}

      _ ->
        {:error, :forbidden}
    end
  end

  defp pass_json(pass) do
    %{
      id: pass.id,
      kind: pass.kind,
      item_name: pass.item_name,
      event_id: pass.event_id,
      order_id: pass.order_id,
      checked_in_at: pass.checked_in_at
    }
  end
end
