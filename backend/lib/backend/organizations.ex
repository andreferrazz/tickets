defmodule Backend.Organizations do
  @moduledoc """
  Organization and membership management.

  An Organization owns events. Each organization has exactly one member with
  role `"leader"` (enforced by a partial unique index) plus zero or more
  `"participant"` and `"staff"` members.

    * `leader` / `participant` — may mutate the org's events (see `can_manage?/2`).
    * `staff` — scan-only: counts as a member (`member?/2`) so the scan endpoint
      accepts them, but `can_manage?/2` is false so they cannot touch events,
      orders, or the org itself.

  Only the leader can invite new members, change member roles, or delete the
  organization. Admin users are not members of any organization and bypass these
  checks via their global role.
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
  Updates the PIX payout destination for `organization_id` on behalf of `user`.
  Leader-only (admins bypass). Used by the dashboard withdraw modal — funds
  belong to the org so the key is org-wide.
  """
  def update_payout_settings(user, organization_id, attrs) do
    case Repo.get(Organization, organization_id) do
      nil ->
        {:error, :not_found}

      org ->
        if authorized_to_update?(user, organization_id) do
          org |> Organization.payout_settings_changeset(attrs) |> Repo.update()
        else
          {:error, :forbidden}
        end
    end
  end

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

  @doc """
  Changes `target_user_id`'s role within `organization_id`. Leader-only
  mutation — the caller must already be authorized. Only `participant` ⇄ `staff`
  transitions are allowed: returns `{:error, :forbidden}` when the target is the
  `leader` or `new_role` is anything other than `"participant"`/`"staff"`, and
  `{:error, :not_found}` when `target_user_id` is not a member. Leadership moves
  go through `transfer_leadership/3` instead.
  """
  def set_member_role(organization_id, target_user_id, new_role)
      when is_binary(organization_id) and is_binary(target_user_id) and
             new_role in ["participant", "staff"] do
    case Repo.one(
           from m in Membership,
             where: m.organization_id == ^organization_id and m.user_id == ^target_user_id
         ) do
      nil ->
        {:error, :not_found}

      %Membership{role: "leader"} ->
        {:error, :forbidden}

      %Membership{} = membership ->
        membership |> Membership.role_changeset(new_role) |> Repo.update()
    end
  end

  def set_member_role(_organization_id, _target_user_id, _new_role), do: {:error, :forbidden}

  @doc "Returns true if `user_id` belongs to `organization_id` (any role)."
  def member?(user_id, organization_id) when is_binary(user_id) and is_binary(organization_id) do
    Repo.exists?(
      from m in Membership,
        where: m.user_id == ^user_id and m.organization_id == ^organization_id
    )
  end

  def member?(_user_id, _organization_id), do: false

  @doc """
  Returns true if `user_id` may manage `organization_id`'s events — i.e. holds a
  `leader` or `participant` membership. `staff` members are members
  (`member?/2`) but not managers, so they fail this check.
  """
  def can_manage?(user_id, organization_id)
      when is_binary(user_id) and is_binary(organization_id) do
    Repo.exists?(
      from m in Membership,
        where:
          m.user_id == ^user_id and
            m.organization_id == ^organization_id and
            m.role in ["leader", "participant"]
    )
  end

  def can_manage?(_user_id, _organization_id), do: false

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

  @doc """
  Returns `[%{user_id, email, role}]` for every member of `organization_id`,
  ordered by email. Used by the leader's team-management UI.
  """
  def list_members(organization_id) when is_binary(organization_id) do
    Repo.all(
      from m in Membership,
        join: u in Backend.Accounts.User,
        on: u.id == m.user_id,
        where: m.organization_id == ^organization_id,
        order_by: [asc: u.email],
        select: %{user_id: u.id, email: u.email, role: m.role}
    )
  end

  def list_members(_), do: []

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

  @doc "Returns the orgs `user_id` can manage (leader or participant)."
  def list_managed_by(user_id) when is_binary(user_id) do
    Repo.all(
      from o in Organization,
        join: m in Membership,
        on: m.organization_id == o.id,
        where: m.user_id == ^user_id and m.role in ["leader", "participant"],
        order_by: [asc: o.name],
        select: o
    )
  end

  def list_managed_by(_), do: []
end
