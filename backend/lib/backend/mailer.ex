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
    |> map_result()
  end

  @doc "Notifies `email` that they have been invited by `inviter_email`."
  def send_invitation(email, inviter_email, token) do
    from = Application.get_env(:backend, :mail_from, "")
    frontend_url = Application.get_env(:backend, :frontend_url, "")

    new()
    |> to(email)
    |> from({"Tickets", from})
    |> subject("Você foi convidado para criar eventos no Tickets")
    |> text_body("""
    Olá!

    #{inviter_email} te convidou para se tornar criador de eventos no Tickets.

    Abra o link abaixo para aceitar o convite e ativar o seu acesso de criador.
    O link expira em 24 horas.

    #{frontend_url}/invite/#{token}

    — Equipe Tickets
    """)
    |> deliver()
    |> map_result()
  end

  @doc "Sends an order confirmation to `email`."
  def send_order_confirmation(email, order) do
    from = Application.fetch_env!(:backend, :mail_from)
    frontend_url = Application.get_env(:backend, :frontend_url, "http://localhost:5173")

    new()
    |> to(email)
    |> from({"Tickets", from})
    |> subject("Pedido confirmado: #{order.event_title}")
    |> text_body("""
    Olá!

    Seu pagamento foi confirmado. 🎉

    Evento: #{order.event_title}
    Total: R$ #{(order.total_cents / 100) |> :erlang.float_to_binary(decimals: 2)}

    Veja os detalhes do seu pedido em:
    #{frontend_url}/orders/#{order.id}

    — Equipe Tickets
    """)
    |> deliver()
    |> map_result()
  end

  defp map_result({:ok, _}), do: :ok
  defp map_result({:error, reason}), do: {:error, reason}
end
