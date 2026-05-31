defmodule BackendWeb.OrganizationController do
  use BackendWeb, :controller

  alias Backend.Organizations

  @doc """
  PATCH /api/v1/organizations/:id — rename an organization.

  Leader-only (admins bypass). Used by the post-invite flow where the new
  leader sets the org's display name after accepting an admin invitation.
  """
  def update(conn, %{"id" => id} = params) do
    attrs = Map.take(params, ["name"])

    case Organizations.update_organization(conn.assigns.current_user, id, attrs) do
      {:ok, org} ->
        json(conn, organization_json(org))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "organization not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  @doc """
  DELETE /api/v1/organizations/:id

  Leader-only (admins bypass). Refuses with 409 if the org still has any
  non-soft-deleted events — the leader must remove events first.
  """
  def delete(conn, %{"id" => id}) do
    case Organizations.delete_organization(conn.assigns.current_user, id) do
      {:ok, _org} ->
        json(conn, %{deleted: true})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "organization not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, :has_active_events} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "organization has active events"})
    end
  end

  @doc """
  PATCH /api/v1/organizations/:id/payout-settings — set the PIX destination.

  Leader-only (admins bypass). Reads `pix_key` and `pix_key_type` from the
  request body.
  """
  def update_payout_settings(conn, %{"id" => id} = params) do
    attrs = Map.take(params, ["pix_key", "pix_key_type"])

    case Organizations.update_payout_settings(conn.assigns.current_user, id, attrs) do
      {:ok, org} ->
        json(conn, organization_json(org))

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "organization not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: format_errors(changeset)})
    end
  end

  defp organization_json(org) do
    %{
      id: org.id,
      name: org.name,
      pix_key: org.pix_key,
      pix_key_type: org.pix_key_type,
      created_at: org.inserted_at,
      updated_at: org.updated_at
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
