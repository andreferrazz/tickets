defmodule Backend.Mailer do
  @moduledoc "Sends transactional emails via Swoosh."

  use Swoosh.Mailer, otp_app: :backend
  import Swoosh.Email

  @doc "Sends a 6-digit auth code to `email`."
  def send_auth_code(email, code) do
    from = Application.fetch_env!(:backend, :mail_from)

    new()
    |> to(email)
    |> from({"Tickets", from})
    |> subject("Seu código de acesso: #{code}")
    |> text_body("""
    Olá!

    Seu código de acesso ao Tickets é: #{code}

    O código expira em 10 minutos. Não compartilhe com ninguém.

    — Equipe Tickets
    """)
    |> deliver()
    |> case do
      {:ok, _} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end
end
