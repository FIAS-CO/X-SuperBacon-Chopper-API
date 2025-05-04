import { RateLimiterMemory } from 'rate-limiter-flexible';
import { MiddlewareHandler } from 'hono';

// メモリベースのレートリミッター
const rateLimiter = new RateLimiterMemory({
    points: 100,     // 1分間に10リクエストまで許可
    duration: 86400,   // 秒単位（1分）
});

// Hono用のミドルウェア
export const rateLimit: MiddlewareHandler = async (c, next) => {
    const key = c.req.query('key'); // URLパラメータからkeyを取得

    if (!key) {
        return c.text('Missing key', 400);
    }

    try {
        await rateLimiter.consume(key); // keyごとに制限を適用
        await next(); // 通過
    } catch {
        return c.text('Too Many Requests', 429);
    }
};