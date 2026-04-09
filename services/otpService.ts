
/**
 * OTP Service for TOTP verification
 */

// Helper to convert Base32 to UInt8Array (simplified for 6-digit codes)
const base32ToBuf = (base32: string) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    const clean = base32.toUpperCase().replace(/=/g, '');
    for (let i = 0; i < clean.length; i++) {
        const val = alphabet.indexOf(clean.charAt(i));
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const buf = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < buf.length; i++) {
        buf[i] = parseInt(bits.substring(i * 8, i * 8 + 8), 2);
    }
    return buf;
};

/**
 * Generates a TOTP code for a given secret and timestamp
 */
export const verifyTOTP = async (secret: string, token: string): Promise<boolean> => {
    if (!secret || !token) return false;

    try {
        const time = Math.floor(Date.now() / 30000);
        const timeBuf = new Uint8Array(8);
        let t = time;
        for (let i = 7; i >= 0; i--) {
            timeBuf[i] = t & 0xff;
            t >>= 8;
        }

        const keyBuf = base32ToBuf(secret);
        const cryptoKey = await crypto.subtle.importKey(
            'raw', keyBuf, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
        );

        const hmac = await crypto.subtle.sign('HMAC', cryptoKey, timeBuf);
        const hmacBuf = new Uint8Array(hmac);
        const offset = hmacBuf[hmacBuf.length - 1] & 0xf;
        const code = (
            (hmacBuf[offset] & 0x7f) << 24 |
            (hmacBuf[offset + 1] & 0xff) << 16 |
            (hmacBuf[offset + 2] & 0xff) << 8 |
            (hmacBuf[offset + 3] & 0xff)
        ) % 1000000;

        const codeStr = String(code).padStart(6, '0');
        return codeStr === token;
    } catch (e) {
        console.error("OTP Verification Error:", e);
        return false;
    }
};

/**
 * Generates a random Base32 secret
 */
export const generateSecret = () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    const crypto = window.crypto || (window as any).msCrypto;
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    for (let i = 0; i < array.length; i++) {
        secret += alphabet.charAt(array[i] % 32);
    }
    return secret;
};/**
 * Generates an otpauth URL for QR code generation
 */
export const getOTPAuthUrl = (userName: string, secret: string) => {
    const issuer = "HR-Analytics";
    const label = encodeURIComponent(`${issuer}:${userName}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
};
