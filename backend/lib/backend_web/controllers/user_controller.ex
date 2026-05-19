defmodule BackendWeb.UserController do
  use BackendWeb, :controller

  alias Backend.Accounts
  alias Backend.Accounts.User

  @doc "GET /api/v1/me"
  def me(conn, _params) do
    json(conn, user_json(conn.assigns.current_user))
  end

  @doc """
  GET /api/v1/me/organizations — the caller's memberships with role per org,
  ordered by org name. Used by the profile page to show affiliations.
  """
  def my_organizations(conn, _params) do
    rows = Backend.Organizations.list_memberships_for_user(conn.assigns.current_user.id)
    json(conn, Enum.map(rows, &membership_json/1))
  end

  defp membership_json(%{organization: org, role: role}) do
    %{id: org.id, name: org.name, role: role}
  end

  @doc "PATCH /api/v1/me/profile — saves name/cellphone/tax_id and registers customer at Abacate Pay."
  def update_profile(conn, %{"name" => _, "cellphone" => _, "tax_id" => _} = params) do
    case Accounts.complete_profile(conn.assigns.current_user, params) do
      {:ok, user} ->
        json(conn, user_json(user))

      {:error, %Ecto.Changeset{} = cs} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: changeset_errors(cs)})

      {:error, :invalid_profile_data} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "invalid_profile_data"})

      {:error, :abacate_unavailable} ->
        conn
        |> put_status(:bad_gateway)
        |> json(%{error: "abacate_unavailable"})
    end
  end

  def update_profile(conn, _),
    do: conn |> put_status(:bad_request) |> json(%{error: "name, cellphone, tax_id required"})

  @doc "Public user serializer; reused by AuthController so all flows agree on shape."
  def user_json(%User{} = user) do
    %{
      id: user.id,
      email: user.email,
      role: user.role,
      invited_by: user.invited_by,
      name: user.name,
      cellphone: user.cellphone,
      tax_id: user.tax_id,
      abacate_customer_id: user.abacate_customer_id,
      profile_complete: User.profile_complete?(user),
      created_at: user.inserted_at
    }
  end

  defp changeset_errors(cs) do
    Ecto.Changeset.traverse_errors(cs, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {k, v}, acc -> String.replace(acc, "%{#{k}}", to_string(v)) end)
    end)
  end
end
