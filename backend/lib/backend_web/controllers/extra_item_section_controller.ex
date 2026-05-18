defmodule BackendWeb.ExtraItemSectionController do
  use BackendWeb, :controller

  alias Backend.Events
  alias BackendWeb.EventController

  @doc "POST /api/v1/events/:event_id/extra-sections"
  def create(conn, %{"event_id" => event_id} = params) do
    case Events.create_section(conn.assigns.current_user, event_id, params) do
      {:ok, section} ->
        section = Backend.Repo.preload(section, :extras)
        conn |> put_status(:created) |> json(EventController.extra_section_json(section))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, %Ecto.Changeset{} = changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc "PUT /api/v1/extra-sections/:id"
  def update(conn, %{"id" => id} = params) do
    case Events.update_section(conn.assigns.current_user, id, params) do
      {:ok, section} ->
        section = Backend.Repo.preload(section, :extras)
        json(conn, EventController.extra_section_json(section))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "section not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc "DELETE /api/v1/extra-sections/:id"
  def delete(conn, %{"id" => id}) do
    case Events.delete_section(conn.assigns.current_user, id) do
      {:ok, _} ->
        json(conn, %{deleted: true})

      {:error, :section_not_empty} ->
        conn |> put_status(:conflict) |> json(%{error: "section_not_empty"})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "section not found"})

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
