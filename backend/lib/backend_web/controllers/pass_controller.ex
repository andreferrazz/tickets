defmodule BackendWeb.PassController do
  use BackendWeb, :controller

  alias Backend.Events.Event
  alias Backend.Repo
  alias Backend.Tickets
  alias Backend.Tickets.Pass

  @doc """
  POST /api/v1/events/:event_id/passes/validate

  Body: `{"token": "<qr token>"}`. Allowed for an admin or any member of the
  event's organization. Scoped to a single event: a token belonging to a
  different event is rejected with `422` so each event's scan page only accepts
  its own tickets.

  Idempotent: subsequent scans return `status: "already_checked_in"` with the
  original `checked_in_at`.
  """
  def validate(conn, %{"event_id" => event_id, "token" => token}) when is_binary(token) do
    user = conn.assigns.current_user

    with {:ok, event} <- fetch_event(event_id),
         :ok <- authorize(user, event),
         {:ok, pass} <- Tickets.fetch_by_token(token),
         :ok <- ensure_same_event(pass, event) do
      {:ok, pass, status} = Tickets.check_in(pass, user)

      conn
      |> put_status(:ok)
      |> json(%{status: Atom.to_string(status), pass: pass_json(pass)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "pass not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "not authorized for this event"})

      {:error, :wrong_event} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "pass belongs to a different event"})
    end
  end

  def validate(conn, _),
    do: conn |> put_status(:bad_request) |> json(%{error: "token required"})

  defp fetch_event(event_id) do
    case Repo.get(Event, event_id) do
      %Event{} = event -> {:ok, event}
      nil -> {:error, :not_found}
    end
  end

  defp authorize(%{role: "admin"}, _event), do: :ok

  defp authorize(user, %Event{organization_id: org_id}) do
    if Backend.Organizations.member?(user.id, org_id),
      do: :ok,
      else: {:error, :forbidden}
  end

  defp ensure_same_event(%Pass{event_id: event_id}, %Event{id: event_id}), do: :ok
  defp ensure_same_event(%Pass{}, %Event{}), do: {:error, :wrong_event}

  defp pass_json(pass) do
    %{
      id: pass.id,
      kind: pass.kind,
      item_name: pass.item_name,
      seat_label: pass.seat_label,
      event_id: pass.event_id,
      order_id: pass.order_id,
      checked_in_at: pass.checked_in_at
    }
  end
end
