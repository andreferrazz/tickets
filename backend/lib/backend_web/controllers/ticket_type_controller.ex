defmodule BackendWeb.TicketTypeController do
  use BackendWeb, :controller

  alias Backend.Events
  alias BackendWeb.EventController

  @doc "POST /api/v1/events/:event_id/ticket-types"
  def create(conn, %{"event_id" => event_id} = params) do
    case Events.create_ticket_type(conn.assigns.current_user, event_id, params) do
      {:ok, tt} ->
        conn |> put_status(:created) |> json(EventController.ticket_type_json(tt))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, %Ecto.Changeset{} = changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})

      {:error, reason} ->
        conn |> put_status(:bad_gateway) |> json(%{error: inspect(reason)})
    end
  end

  @doc "PUT /api/v1/ticket-types/:id"
  def update(conn, %{"id" => id} = params) do
    case Events.update_ticket_type(conn.assigns.current_user, id, params) do
      {:ok, tt} ->
        json(conn, EventController.ticket_type_json(tt))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "ticket type not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc "DELETE /api/v1/ticket-types/:id"
  def delete(conn, %{"id" => id}) do
    case Events.delete_ticket_type(conn.assigns.current_user, id) do
      {:ok, _} ->
        json(conn, %{deleted: true})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "ticket type not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
