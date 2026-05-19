defmodule BackendWeb.EventController do
  use BackendWeb, :controller
  require Logger

  alias Backend.Events
  alias Backend.Events.Seating

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

      {:error, :seat_selection_in_use} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "seat_selection_in_use"})

      {:error, :seats_per_table_too_low} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "seats_per_table_too_low"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc """
  GET /api/v1/events/:id/seating — live availability for the buyer page.

  Returns 404 when seat selection is disabled on the event so the frontend can
  fall back to the legacy flow without inspecting flags.
  """
  def seating(conn, %{"id" => id}) do
    case Events.get_event(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "event not found"})

      event ->
        case Seating.seating_snapshot(event) do
          nil -> conn |> put_status(:not_found) |> json(%{error: "seating disabled"})
          snapshot -> json(conn, seating_json(snapshot))
        end
    end
  end

  @doc "GET /api/v1/events/:id/stats — creator/admin only; 404 otherwise"
  def stats(conn, %{"id" => id}) do
    case Events.event_stats(conn.assigns.current_user, id) do
      {:ok, stats} -> json(conn, stats_json(stats))
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "event not found"})
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
      tickets_description: e.tickets_description,
      location: e.location,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      cover_image_url: e.cover_image_url,
      status: e.status,
      seat_selection_enabled: e.seat_selection_enabled,
      seats_per_table: e.seats_per_table,
      created_at: e.inserted_at,
      updated_at: e.updated_at
    }
  end

  def event_detail_json(event) do
    base =
      event_json(event)
      |> Map.merge(%{
        ticket_types: Enum.map(event.ticket_types, &ticket_type_json/1),
        extra_sections: Enum.map(event.extra_item_sections, &extra_section_json/1)
      })

    case Seating.seating_snapshot(event) do
      nil -> Map.put(base, :seating, nil)
      snapshot -> Map.put(base, :seating, seating_json(snapshot))
    end
  end

  defp seating_json(snapshot) do
    %{
      seats_per_table: snapshot.seats_per_table,
      tables:
        Enum.map(snapshot.tables, fn t ->
          %{
            id: t.id,
            name: t.name,
            position: t.position,
            taken_seats: t.taken_seats
          }
        end)
    }
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
    batches = ordered_batches(tt)
    active = Enum.find(batches, &is_nil(&1.closed_at))

    %{
      id: tt.id,
      event_id: tt.event_id,
      name: tt.name,
      description: tt.description,
      sales_start: tt.sales_start,
      sales_end: tt.sales_end,
      active_batch: if(active, do: batch_json(active), else: nil),
      batches: Enum.map(batches, &batch_json/1)
    }
  end

  def batch_json(b) do
    %{
      id: b.id,
      ticket_type_id: b.ticket_type_id,
      sequence: b.sequence,
      label: "Lote #{b.sequence}",
      price_cents: b.price_cents,
      quantity_total: b.quantity_total,
      quantity_sold: b.quantity_sold,
      closed_at: b.closed_at
    }
  end

  defp ordered_batches(%{batches: %Ecto.Association.NotLoaded{}}), do: []

  defp ordered_batches(%{batches: batches}) when is_list(batches),
    do: Enum.sort_by(batches, & &1.sequence)

  defp ordered_batches(_), do: []

  def extra_json(ex) do
    %{
      id: ex.id,
      event_id: ex.event_id,
      section_id: ex.section_id,
      name: ex.name,
      description: ex.description,
      price_cents: ex.price_cents,
      quantity_total: ex.quantity_total,
      quantity_sold: ex.quantity_sold,
      show_remaining: ex.show_remaining
    }
  end

  defp stats_json(stats) do
    %{
      event_id: stats.event_id,
      totals: stats.totals,
      ticket_types: stats.ticket_types,
      extras: stats.extras,
      recent_orders: Enum.map(stats.recent_orders, &recent_order_json/1)
    }
  end

  defp recent_order_json(o) do
    %{
      id: o.id,
      buyer_email: o.buyer_email,
      status: o.status,
      total_cents: o.total_cents,
      paid_at: o.paid_at,
      created_at: o.inserted_at,
      item_count: o.item_count
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
