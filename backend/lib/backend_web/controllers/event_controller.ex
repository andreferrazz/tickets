defmodule BackendWeb.EventController do
  use BackendWeb, :controller
  require Logger

  alias Backend.Events

  @doc "GET /api/v1/events — published events plus the caller's own drafts (admins see all)"
  def index(conn, _params) do
    user = conn.assigns[:current_user]
    Logger.info("event_controller.index", user_id: user && user.id, role: user && user.role)
    json(conn, Enum.map(Events.list_events(user), &event_json/1))
  end

  @doc "GET /api/v1/events/:id"
  def show(conn, %{"id" => id}) do
    case Events.get_event(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})

      event ->
        if visible?(event, conn.assigns[:current_user]) do
          json(conn, event_detail_json(event))
        else
          conn |> put_status(:not_found) |> json(%{error: "event not found"})
        end
    end
  end

  # Published events are public. Drafts/cancelled are only visible to their
  # creator or an admin — return 404 to anyone else to avoid leaking existence.
  defp visible?(%{status: "published"}, _user), do: true
  defp visible?(_event, nil), do: false
  defp visible?(_event, %{role: "admin"}), do: true
  defp visible?(%{creator_id: cid}, %{id: uid}), do: cid == uid

  @doc "POST /api/v1/events — creator only"
  def create(conn, params) do
    case Events.create_event(conn.assigns.current_user, params) do
      {:ok, event} ->
        event = Backend.Repo.preload(event, [:ticket_types, extra_item_sections: :extras])
        conn |> put_status(:created) |> json(event_detail_json(event))

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc "PUT /api/v1/events/:id"
  def update(conn, %{"id" => id} = params) do
    case Events.update_event(conn.assigns.current_user, id, params) do
      {:ok, event} ->
        event = Backend.Repo.preload(event, [:ticket_types, extra_item_sections: :extras])
        json(conn, event_detail_json(event))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc "DELETE /api/v1/events/:id"
  def delete(conn, %{"id" => id}) do
    case Events.delete_event(conn.assigns.current_user, id) do
      {:ok, _} -> json(conn, %{deleted: true})
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "event not found"})
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  # ---------------------------------------------------------------------------

  def event_json(e) do
    %{
      id: e.id,
      creator_id: e.creator_id,
      title: e.title,
      description: e.description,
      location: e.location,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      cover_image_url: e.cover_image_url,
      status: e.status,
      created_at: e.inserted_at,
      updated_at: e.updated_at
    }
  end

  def event_detail_json(event) do
    event_json(event)
    |> Map.merge(%{
      ticket_types: Enum.map(event.ticket_types, &ticket_type_json/1),
      extra_sections: Enum.map(event.extra_item_sections, &extra_section_json/1)
    })
  end

  def extra_section_json(s) do
    %{
      id: s.id,
      event_id: s.event_id,
      title: s.title,
      description: s.description,
      position: s.position,
      extras: Enum.map(s.extras, &extra_json/1)
    }
  end

  def ticket_type_json(tt) do
    %{
      id: tt.id,
      event_id: tt.event_id,
      name: tt.name,
      description: tt.description,
      price_cents: tt.price_cents,
      quantity_total: tt.quantity_total,
      quantity_sold: tt.quantity_sold,
      sales_start: tt.sales_start,
      sales_end: tt.sales_end
    }
  end

  def extra_json(ex) do
    %{
      id: ex.id,
      event_id: ex.event_id,
      section_id: ex.section_id,
      name: ex.name,
      description: ex.description,
      price_cents: ex.price_cents,
      quantity_total: ex.quantity_total,
      quantity_sold: ex.quantity_sold
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
