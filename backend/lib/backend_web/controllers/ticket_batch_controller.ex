defmodule BackendWeb.TicketBatchController do
  use BackendWeb, :controller

  alias Backend.Events
  alias BackendWeb.EventController

  @doc "POST /api/v1/ticket-types/:ticket_type_id/batches"
  def create(conn, %{"ticket_type_id" => ticket_type_id} = params) do
    case Events.create_batch(conn.assigns.current_user, ticket_type_id, params) do
      {:ok, batch} ->
        conn |> put_status(:created) |> json(EventController.batch_json(batch))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "ticket type not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, %Ecto.Changeset{} = changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})

      {:error, reason} ->
        conn |> put_status(:bad_gateway) |> json(%{error: inspect(reason)})
    end
  end

  @doc "PUT /api/v1/batches/:id"
  def update(conn, %{"id" => id} = params) do
    case Events.update_batch(conn.assigns.current_user, id, params) do
      {:ok, batch} ->
        json(conn, EventController.batch_json(batch))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "batch not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc "POST /api/v1/batches/:id/close"
  def close(conn, %{"id" => id}) do
    case Events.close_batch(conn.assigns.current_user, id) do
      {:ok, batch} -> json(conn, EventController.batch_json(batch))
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "batch not found"})
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  @doc "DELETE /api/v1/batches/:id"
  def delete(conn, %{"id" => id}) do
    case Events.delete_batch(conn.assigns.current_user, id) do
      {:ok, _} ->
        json(conn, %{deleted: true})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "batch not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, :batch_has_sales} ->
        conn |> put_status(:conflict) |> json(%{error: "batch_has_sales"})
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
