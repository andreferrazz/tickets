defmodule BackendWeb.AuthController do
  use BackendWeb, :controller

  alias Backend.Accounts

  @doc "POST /api/v1/auth/request-code"
  def request_code(conn, %{"email" => email}) do
    case Accounts.request_code(email) do
      {:ok, _code} ->
        json(conn, %{sent: true})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: inspect(reason)})
    end
  end

  def request_code(conn, _), do: bad_request(conn, "email required")

  @doc "POST /api/v1/auth/verify-code"
  def verify_code(conn, %{"email" => email, "code" => code}) do
    case Accounts.verify_code(email, code) do
      {:ok, %{token: token, user: user}} ->
        json(conn, %{token: token, user: user_json(user)})

      {:error, :invalid_or_expired_code} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "invalid or expired code"})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: inspect(reason)})
    end
  end

  def verify_code(conn, _), do: bad_request(conn, "email and code required")

  @doc "DELETE /api/v1/auth/logout"
  def logout(conn, _params) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] -> Accounts.logout(token)
      _ -> :ok
    end

    json(conn, %{logged_out: true})
  end

  # ---------------------------------------------------------------------------

  defp bad_request(conn, msg) do
    conn |> put_status(:bad_request) |> json(%{error: msg})
  end

  defp user_json(user) do
    %{
      id: user.id,
      email: user.email,
      role: user.role,
      invited_by: user.invited_by,
      created_at: user.inserted_at
    }
  end
end
