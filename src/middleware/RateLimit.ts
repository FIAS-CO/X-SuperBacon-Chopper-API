import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Context, MiddlewareHandler } from 'hono';
import { discordNotifyService } from '../service/DiscordNotifyService';
import { serverDecryption } from '../util/ServerDecryption';

const longRateLimiter = new RateLimiterMemory({
    points: 40,            // 40回まで許可（APIアクセスなど）
    duration: 1200,        // 1200秒（=20分）ごとにポイントがリセットされる
    blockDuration: 21600   // 上限を超えると21600秒（=6時間）ブロックされる
});

const middleRateLimiter = new RateLimiterMemory({
    points: 9,             // 9回まで許可
    duration: 120,         // 120秒（=2分）ごとにリセット
    blockDuration: 1800    // 超過時は1800秒（=30分）ブロック
});

const shortRateLimiter = new RateLimiterMemory({
    points: 5,             // 5回まで許可
    duration: 60,          // 60秒（=1分）ごとにリセット
    blockDuration: 1800    // 超過時は1800秒（=30分）ブロック
});

export const rateLimit: MiddlewareHandler = async (c, next) => {
    const key = c.req.query('key'); // URLパラメータからkeyを取得

    if (!key) {
        return c.text('Missing key', 400);
    }

    try {
        await shortRateLimiter.consume(key);
    } catch {
        notifyRateLimit(key, 'Short');
        return rateLimitExceededResponse(c);
    }

    try {
        await middleRateLimiter.consume(key);
    } catch {
        notifyRateLimit(key, 'Middle');
        return rateLimitExceededResponse(c);
    }

    try {
        await longRateLimiter.consume(key);
    } catch {
        notifyRateLimit(key, 'Long');
        return rateLimitExceededResponse(c);
    }

    await next();
};

async function notifyRateLimit(key: string, limiterName: "Long" | "Middle" | "Short"): Promise<void> {
    const decryptedKey = serverDecryption.decrypt(key);
    const message = `
🚨 **Rate Limit Alert**
**Key:** ${decryptedKey}
**Limiter:** ${limiterName}
    `.trim();

    await discordNotifyService.sendMessage(message);
}

function rateLimitExceededResponse(c: Context): Response {
    return c.text('Too Many Requests', 429);
}
