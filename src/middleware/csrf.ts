import { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { generateRandomHexString } from '../FunctionUtil'

// CSRFトークン設定ミドルウェア
export const setCsrf: MiddlewareHandler = async (c, next) => {
    const token = generateRandomHexString(32);
    setCookie(c, 'csrf-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 30 * 60, // 30分
    });
    await next();
};

// CSRFトークン検証ミドルウェア
export const validateCsrf: MiddlewareHandler = async (c, next) => {
    const cookieToken = getCookie(c, 'csrf-token');
    const headerToken = c.req.header('X-CSRF-Token');

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        // 新しいトークンを発行（ブルートフォース対策）
        setCookie(c, 'csrf-token', generateRandomHexString(32), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 30 * 60,
        });
        return c.json({ error: 'CSRF validation failed' }, 403);
    }

    // 検証成功後も新しいトークンを発行（使い回し防止）
    setCookie(c, 'csrf-token', generateRandomHexString(32), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 30 * 60,
    });

    return await next();
};

// リファラーチェックミドルウェア
export const validateReferer: MiddlewareHandler = async (c, next) => {
    const referer = c.req.header('Referer');
    const allowedOrigins = ['https://yourdomain.com']; // 許可するオリジン
    const validReferer = referer && allowedOrigins.some(origin => referer.startsWith(origin));

    if (!validReferer) {
        return c.json({ error: 'Invalid referer' }, 403);
    }

    return await next();
};