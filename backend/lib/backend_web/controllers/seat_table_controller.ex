defmodule BackendWeb.SeatTableController do
  use BackendWeb, :controller

  alias Backend.Events

  @doc "POST /api/v1/events/:event_id/seat-tables"
  def create(conn, %{"event_id" => event_id} = params) do
    case Events.create_seat_table(conn.assigns.current_user, event_id, params) do
      {:ok, table} ->
        conn |> put_status(:created) |> json(table_json(table))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, %Ecto.Changeset{} = changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc "PUT /api/v1/seat-tables/:id"
  def update(conn, %{"id" => id} = params) do
    case Events.update_seat_table(conn.assigns.current_user, id, params) do
      {:ok, table} ->
        json(conn, table_json(table))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "seat table not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, %Ecto.Changeset{} = changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc "DELETE /api/v1/seat-tables/:id"
  def delete(conn, %{"id" => id}) do
    case Events.delete_seat_table(conn.assigns.current_user, id) do
      {:ok, _} ->
        json(conn, %{deleted: true})

      {:error, :table_has_assignments} ->
        conn |> put_status(:conflict) |> json(%{error: "table_has_assignments"})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "seat table not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  def table_json(t) do
    %{
      id: t.id,
      event_id: t.event_id,
      name: t.name,
      position: t.position
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
