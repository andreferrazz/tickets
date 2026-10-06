import QRCode from 'qrcode';

/** Pixel width the Phoenix mailer rendered pass QR codes at (EQRCode.png width: 480). */
const QR_WIDTH_PX = 480;

/**
 * PNG bytes of a QR code encoding `text`, sized for an email body or a pass
 * page. Pure apart from the encoding library it wraps.
 *
 * @example
 * const png = await renderQrPng(pass.token);
 * mailer.send({ ..., inlineImages: [{ cid: pass.token, filename: `${pass.token}.png`, contentType: 'image/png', content: png }] });
 */
export async function renderQrPng(text: string): Promise<Uint8Array> {
    const buffer = await QRCode.toBuffer(text, {
        type: 'png',
        width: QR_WIDTH_PX,
        errorCorrectionLevel: 'M'
    });
    return new Uint8Array(buffer);
}
