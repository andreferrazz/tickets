defmodule Backend.Organizations do
  @moduledoc """
  Organization and membership management.

  An Organization owns events. Each organization has exactly one member with
  role `"leader"` (enforced by a partial unique index) and zero or more
  `"participant"` members. Both leaders and participants can mutate the org's
  events; only the leader can invite new members or delete the organization.
  Admin users are not members of any organization and bypass these checks via
  their global role.
  """

  import Ecto.Query
  alias Backend.Repo
  alias Backend.Organizations.{Membership, Organization}
  alias Backend.Events.Event

  # ---------------------------------------------------------------------------
  # Organizations
  # ---------------------------------------------------------------------------

  @doc "Inserts a new organization. Caller is responsible for adding the leader."
  def create_organization(attrs) do
    attrs |> Organization.changeset() |> Repo.insert()
  end

  @doc "Returns the organization or `nil`."
  def get_organization(id), do: Repo.get(Organization, id)

  @doc """
  Updates `organization_id` on behalf of `user`. Leader-only (admins bypass).
  Used by the post-invite rename flow: a fresh leader is shown a form to set
  the org's name immediately after accepting.
  """
  def update_organization(user, organization_id, attrs) do
    case Repo.get(Organization, organization_id) do
      nil ->
        {:error, :not_found}

      org ->
        if authorized_to_update?(user, organization_id) do
          org |> Organization.update_changeset(attrs) |> Repo.update()
        else
          {:error, :forbidden}
        end
    end
  end

  defp authorized_to_update?(%{role: "admin"}, _org_id), do: true
  defp authorized_to_update?(user, org_id), do: leader?(user.id, org_id)

  @doc """
  Deletes `organization_id` on behalf of `user`. Refuses unless the user is the
  leader (admins bypass). Refuses with `{:error, :has_active_events}` whenever
  any event row still references the org — soft-deleted or not — because the
  `events.organization_id` FK is `ON DELETE RESTRICT` and would otherwise raise.
  This keeps audit data intact while still preventing accidental org removal.
  """
  def delete_organization(user, organization_id) do
    cond do
      not authorized_to_delete?(user, organization_id) ->
        case Repo.get(Organization, organization_id) do
          nil -> {:error, :not_found}
          _ -> {:error, :forbidden}
        end

      has_any_events?(organization_id) ->
        {:error, :has_active_events}

      true ->
        case Repo.get(Organization, organization_id) do
          nil -> {:error, :not_found}
          org -> Repo.delete(org)
        end
    end
  end

  defp authorized_to_delete?(%{role: "admin"}, _org_id), do: true
  defp authorized_to_delete?(user, org_id), do: leader?(user.id, org_id)

  defp has_any_events?(org_id) do
    Repo.exists?(from e in Event, where: e.organization_id == ^org_id)
  end

  # ---------------------------------------------------------------------------
  # Memberships
  # ---------------------------------------------------------------------------

  @doc """
  Adds `user_id` to `organization_id` as `role`. Returns `{:error, :already_member}`
  if a membership already exists, or `{:error, :leader_exists}` if `role` is
  `"leader"` and the org already has one — both raced via DB unique indexes.
  """
  def add_member(organization_id, user_id, role) do
    attrs = %{organization_id: organization_id, user_id: user_id, role: role}

    case attrs |> Membership.changeset() |> Repo.insert() do
      {:ok, membership} ->
        {:ok, membership}

      {:error, %Ecto.Changeset{errors: errors} = cs} ->
        cond do
          Keyword.has_key?(errors, :organization_id) -> {:error, :already_member}
          Keyword.has_key?(errors, :user_id) -> {:error, :already_member}
          Keyword.has_key?(errors, :role) -> {:error, :leader_exists}
          true -> {:error, cs}
        end
    end
  end

  @doc """
  Transfers leadership from `from_user_id` to `to_user_id` inside one
  transaction: the current leader's role becomes `"participant"` and the named
  participant becomes `"leader"`. The participant must already be a member.
  """
  def transfer_leadership(organization_id, from_user_id, to_user_id) do
    Repo.transaction(fn ->
      from_membership = fetch_membership!(organization_id, from_user_id)
      to_membership = fetch_membership!(organization_id, to_user_id)

      cond do
        from_membership.role != "leader" ->
          Repo.rollback(:not_leader)

        to_membership.role != "participant" ->
          Repo.rollback(:not_participant)

        true ->
          # Demote first so the partial-unique-leader index does not block the
          # subsequent promote. Both updates run inside the same transaction.
          from_membership
          |> Membership.role_changeset("participant")
          |> Repo.update!()

          to_membership
          |> Membership.role_changeset("leader")
          |> Repo.update!()

          :ok
      end
    end)
  end

  defp fetch_membership!(org_id, user_id) do
    Repo.one!(
      from m in Membership,
        where: m.organization_id == ^org_id and m.user_id == ^user_id
    )
  end

  @doc "Returns true if `user_id` belongs to `organization_id` (any role)."
  def member?(user_id, organization_id) when is_binary(user_id) and is_binary(organization_id) do
    Repo.exists?(
      from m in Membership,
        where: m.user_id == ^user_id and m.organization_id == ^organization_id
    )
  end

  def member?(_user_id, _organization_id), do: false

  @doc "Returns true if `user_id` is the leader of `organization_id`."
  def leader?(user_id, organization_id) when is_binary(user_id) and is_binary(organization_id) do
    Repo.exists?(
      from m in Membership,
        where:
          m.user_id == ^user_id and
            m.organization_id == ^organization_id and
            m.role == "leader"
    )
  end

  def leader?(_user_id, _organization_id), do: false

  @doc "Returns the orgs the user belongs to, ordered by name."
  def list_for_user(user_id) when is_binary(user_id) do
    Repo.all(
      from o in Organization,
        join: m in Membership,
        on: m.organization_id == o.id,
        where: m.user_id == ^user_id,
        order_by: [asc: o.name],
        select: o
    )
  end

  def list_for_user(_), do: []

  @doc "Returns the org IDs the user belongs to. Cheap helper for IN-clauses."
  def list_organization_ids_for_user(user_id) when is_binary(user_id) do
    Repo.all(
      from m in Membership,
        where: m.user_id == ^user_id,
        select: m.organization_id
    )
  end

  def list_organization_ids_for_user(_), do: []

  @doc """
  Returns `[%{organization: %Organization{}, role: role}]` for every
  membership `user_id` holds. Useful for showing the user their
  affiliations on the profile page.
  """
  def list_memberships_for_user(user_id) when is_binary(user_id) do
    Repo.all(
      from m in Membership,
        join: o in Organization,
        on: o.id == m.organization_id,
        where: m.user_id == ^user_id,
        order_by: [asc: o.name],
        select: %{organization: o, role: m.role}
    )
  end

  def list_memberships_for_user(_), do: []

  @doc "Returns the orgs `user_id` leads."
  def list_led_by(user_id) when is_binary(user_id) do
    Repo.all(
      from o in Organization,
        join: m in Membership,
        on: m.organization_id == o.id,
        where: m.user_id == ^user_id and m.role == "leader",
        order_by: [asc: o.name],
        select: o
    )
  end

  def list_led_by(_), do: []
end
