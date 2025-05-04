import { RateLimiterMemory } from 'rate-limiter-flexible';
import { MiddlewareHandler } from 'hono';

// メモリベースのレートリミッター
const longRateLimiter = new RateLimiterMemory({
    points: 40,
    duration: 1800,
    blockDuration: 86400     // 超えたら86400秒 = 1日間ブロック
});

const shortRateLimiter = new RateLimiterMemory({
    points: 4,
    duration: 1,
    blockDuration: 1800     // 超えたら1800秒 = 30分間ブロック
});

// Hono用のミドルウェア
export const rateLimit: MiddlewareHandler = async (c, next) => {
    const key = c.req.query('key'); // URLパラメータからkeyを取得

    if (!key) {
        return c.text('Missing key', 400);
    }

    try {
        await Promise.all([
            shortRateLimiter.consume(key),
            longRateLimiter.consume(key),
        ]);
        await next(); // 通過
    } catch {
        return c.text('Too Many Requests', 429);
    }
};