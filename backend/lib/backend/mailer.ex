defmodule Backend.Mailer do
  @moduledoc "Sends transactional emails via Swoosh."

  use Swoosh.Mailer, otp_app: :backend
  import Swoosh.Email

  alias Backend.Tickets

  require EEx

  EEx.function_from_file(
    :defp,
    :render_tickets_html,
    Path.join(__DIR__, "mailer/templates/tickets.html.eex"),
    [:event_title, :passes, :order_url],
    engine: Phoenix.HTML.Engine
  )

  EEx.function_from_file(
    :defp,
    :render_extras_html,
    Path.join(__DIR__, "mailer/templates/extras.html.eex"),
    [:event_title, :pass, :items, :order_url],
    engine: Phoenix.HTML.Engine
  )

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

  @doc """
  Sends the ticket QR codes to `email`. One inline QR image is attached per
  pass; the HTML body references them by `cid:<token>`.
  """
  def send_tickets_email(email, order, passes) do
    from = Application.fetch_env!(:backend, :mail_from)

    html =
      render_tickets_html(order.event_title, passes, order_url(order))
      |> Phoenix.HTML.safe_to_string()

    base =
      new()
      |> to(email)
      |> from({"Tickets", from})
      |> subject("Seus ingressos: #{order.event_title}")
      |> html_body(html)
      |> text_body(tickets_text_fallback(order, passes))

    passes
    |> Enum.reduce(base, &attach_qr(&2, &1))
    |> deliver()
    |> map_result()
  end

  @doc """
  Sends the single combined extras QR code to `email`. `items` is the list of
  `extra`-type `OrderItem`s in the order, used to render the inventory list.
  """
  def send_extras_email(email, order, %{} = pass, items) do
    from = Application.fetch_env!(:backend, :mail_from)

    html =
      render_extras_html(order.event_title, pass, items, order_url(order))
      |> Phoenix.HTML.safe_to_string()

    new()
    |> to(email)
    |> from({"Tickets", from})
    |> subject("Seus extras: #{order.event_title}")
    |> html_body(html)
    |> text_body(extras_text_fallback(order, items))
    |> attach_qr(pass)
    |> deliver()
    |> map_result()
  end

  defp attach_qr(email, pass) do
    attachment(
      email,
      Swoosh.Attachment.new({:data, Tickets.qr_png(pass)},
        filename: "#{pass.token}.png",
        content_type: "image/png",
        type: :inline,
        headers: [{"Content-ID", "<#{pass.token}>"}]
      )
    )
  end

  defp order_url(order) do
    frontend_url = Application.get_env(:backend, :frontend_url, "http://localhost:5173")
    "#{frontend_url}/orders/#{order.id}"
  end

  defp tickets_text_fallback(order, passes) do
    """
    Olá! Seu pagamento para o nosso Arraiá foi confirmado com sucesso! 🎉

    Apresente o QR Code abaixo na entrada do evento. Cada ingresso possui um código exclusivo.
    Local: CEAL - Rua Itaberá, 1012, Santa Efigênia, Belo Horizonte/MG - CEP 30260-320
    (Entrada pela quadra da CEAL)
    Data: 12 de julho
    Horário: das 16h às 19h

    Seus ingressos para #{order.event_title} estão neste email. Quantidade: #{length(passes)}.
    Detalhes: #{order_url(order)}

    Te vejo lá! 🌽🍿
    """
  end

  defp extras_text_fallback(order, items) do
    lines = Enum.map_join(items, "\n", &"- #{&1.item_name} × #{&1.quantity}")

    """
    Seu QR Code de extras para #{order.event_title} está neste email.

    Itens:
    #{lines}

    Detalhes: #{order_url(order)}
    """
  end

  defp map_result({:ok, _}), do: :ok
  defp map_result({:error, reason}), do: {:error, reason}
end
