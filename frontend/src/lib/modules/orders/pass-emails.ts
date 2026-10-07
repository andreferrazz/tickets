import type { InlineImage, OutgoingEmail } from '$lib/integrations/mail/mailer';
import { renderQrPng } from '$lib/integrations/qr-code';
import { escapeHtml } from '$lib/utils/html-escape';

/** A pass as the emails show it: its name and the token its QR code encodes. */
export interface EmailedPass {
    token: string;
    itemName: string;
}

export interface ExtraLine {
    name: string;
    quantity: number;
}

export interface PassEmailContext {
    to: string;
    eventTitle: string;
    /** The buyer's order page. */
    orderUrl: string;
}

/**
 * The tickets email, word for word as `Backend.Mailer.send_tickets_email/3`
 * sent it: one inline QR code per pass, referenced from the body by `cid:`.
 * The venue, date and time in the copy are those of the event the platform
 * was launched for; they came across unchanged and are not read from the event.
 *
 * @example
 * await mailer.send(await ticketsEmail({ to, eventTitle, orderUrl }, passes));
 */
export async function ticketsEmail(
    context: PassEmailContext,
    passes: EmailedPass[]
): Promise<OutgoingEmail> {
    return {
        to: context.to,
        subject: `Seus ingressos: ${context.eventTitle}`,
        text: ticketsText(context, passes.length),
        html: ticketsHtml(context, passes),
        inlineImages: await Promise.all(passes.map(qrImage))
    };
}

/**
 * The extras email, as `Backend.Mailer.send_extras_email/4` sent it: the one QR
 * code that covers every extra of the order, and the list of what it covers.
 *
 * @example
 * await mailer.send(await extrasEmail({ to, eventTitle, orderUrl }, pass, lines));
 */
export async function extrasEmail(
    context: PassEmailContext,
    pass: EmailedPass,
    lines: ExtraLine[]
): Promise<OutgoingEmail> {
    return {
        to: context.to,
        subject: `Seus extras: ${context.eventTitle}`,
        text: extrasText(context, lines),
        html: extrasHtml(context, pass, lines),
        inlineImages: [await qrImage(pass)]
    };
}

async function qrImage(pass: EmailedPass): Promise<InlineImage> {
    return {
        cid: pass.token,
        filename: `${pass.token}.png`,
        contentType: 'image/png',
        content: await renderQrPng(pass.token)
    };
}

function ticketsText(context: PassEmailContext, count: number): string {
    return [
        'Olá! Seu pagamento para o nosso evento do Café com Arte foi confirmado com sucesso! 🤍',
        '',
        'Apresente o QR Code abaixo na entrada do evento. Cada ingresso possui um código exclusivo.',
        'Local: CEAL – Rua Itaberá, 1012, Santa Efigênia, Belo Horizonte/MG – CEP 30260-320',
        '(Entrada pela quadra da CEAL)',
        'Data: 27 de setembro',
        'Horário: das 16h às 19h',
        '',
        `Seus ingressos para ${context.eventTitle} estão neste email. Quantidade: ${count}.`,
        `Detalhes: ${context.orderUrl}`,
        '',
        'Te vejo lá! ☕️🖌️',
        ''
    ].join('\n');
}

function extrasText(context: PassEmailContext, lines: ExtraLine[]): string {
    return [
        `Seu QR Code de extras para ${context.eventTitle} está neste email.`,
        '',
        'Itens:',
        ...lines.map((line) => `- ${line.name} × ${line.quantity}`),
        '',
        `Detalhes: ${context.orderUrl}`,
        ''
    ].join('\n');
}

const TICKETS_INTRO_HTML = `    <p>Olá! Seu pagamento para o nosso evento do Café com Arte foi confirmado com sucesso! 🤍</p>
    <p>Apresente o QR Code abaixo na entrada do evento. Cada ingresso possui um código exclusivo.</p>
    <p>
      <strong>Local:</strong> CEAL – Rua Itaberá, 1012, Santa Efigênia, Belo Horizonte/MG – CEP 30260-320<br />
      (Entrada pela quadra da CEAL)<br />
      <strong>Data:</strong> 27 de setembro<br />
      <strong>Horário:</strong> das 16h às 19h
    </p>`;

function ticketsHtml(context: PassEmailContext, passes: EmailedPass[]): string {
    const cards = passes.map(
        (pass) => `
    <div style="border:1px solid #ccc;padding:16px;margin:16px 0;border-radius:8px;">
      <h2 style="margin:0 0 8px 0;font-size:18px;">${escapeHtml(pass.itemName)}</h2>
      ${qrTag(pass)}
    </div>`
    );
    return htmlDocument(`    <h1>Seus ingressos — ${escapeHtml(context.eventTitle)}</h1>
${TICKETS_INTRO_HTML}
${cards.join('\n')}
${orderLink(context.orderUrl)}
    <p>Te vejo lá! ☕️🖌️</p>`);
}

function extrasHtml(context: PassEmailContext, pass: EmailedPass, lines: ExtraLine[]): string {
    const items = lines.map((line) => `      <li>${escapeHtml(line.name)} × ${line.quantity}</li>`);
    return htmlDocument(`    <h1>Seus extras — ${escapeHtml(context.eventTitle)}</h1>
    <p>O QR Code abaixo cobre todos os itens extras do seu pedido. Apresente-o no evento para retirá-los.</p>

    <div style="border:1px solid #ccc;padding:16px;margin:16px 0;border-radius:8px;">
      ${qrTag(pass)}
    </div>

    <h2 style="font-size:16px;">Itens incluídos:</h2>
    <ul>
${items.join('\n')}
    </ul>

${orderLink(context.orderUrl)}
    <p style="color:#888;">— Equipe Tickets</p>`);
}

function htmlDocument(body: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
  <body style="font-family: sans-serif; color: #222;">
${body}
  </body>
</html>
`;
}

function qrTag(pass: EmailedPass): string {
    return `<img src="cid:${escapeHtml(pass.token)}" alt="QR Code" width="240" height="240" style="display:block;" />`;
}

function orderLink(orderUrl: string): string {
    const url = escapeHtml(orderUrl);
    return `    <p>Detalhes do pedido:
      <a href="${url}">${url}</a>
    </p>`;
}
