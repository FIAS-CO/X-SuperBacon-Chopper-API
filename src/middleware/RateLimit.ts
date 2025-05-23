import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Context, MiddlewareHandler } from 'hono';
import { discordNotifyService } from '../service/DiscordNotifyService';
import { serverDecryption } from '../util/ServerDecryption';
import { respondWithError } from '../util/Response';
import { Log } from '../util/Log';
import { ErrorCodes } from '../errors/ErrorCodes';

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

const veryShortRateLimiter = new RateLimiterMemory({
    points: 4,             // 4回まで許可
    duration: 2,           // 2秒（=2秒）ごとにリセット
    blockDuration: 1800    // 超過時は1800秒（=30分）ブロック
});

/**
 * 現状 check-by-user API のみを対象にしたレートリミッター
 * @param c 
 * @param next 
 * @returns 
 */
export const rateLimit: MiddlewareHandler = async (c, next) => {
    const data = await c.req.json();
    const path = c.req.path;
    const key = `${path}-${data.key}`;

    Log.debug(`Rate limit key: ${key}`);

    if (!key) {
        return respondWithError(c, 'Validation failed.', ErrorCodes.MISSING_CHECK_BY_USER_IP, 400);
    }

    const connectionIp = c.req.header('x-forwarded-for') ||
        c.req.raw.headers.get('x-forwarded-for') ||
        c.req.header('x-real-ip') ||
        c.env?.remoteAddress ||
        'unknown';

    try {
        await veryShortRateLimiter.consume(key);
    } catch {
        notifyRateLimit(key, 'VeryShort', connectionIp);
        return rateLimitExceededResponse(c);
    }

    try {
        await shortRateLimiter.consume(key);
    } catch {
        notifyRateLimit(key, 'Short', connectionIp);
        return rateLimitExceededResponse(c);
    }

    try {
        await middleRateLimiter.consume(key);
    } catch {
        notifyRateLimit(key, 'Middle', connectionIp);
        return rateLimitExceededResponse(c);
    }

    try {
        await longRateLimiter.consume(key);
    } catch {
        notifyRateLimit(key, 'Long', connectionIp);
        return rateLimitExceededResponse(c);
    }

    await next();
};

async function notifyRateLimit(key: string, limiterName: "Long" | "Middle" | "Short" | "VeryShort", connectionIp: string = 'unknown'): Promise<void> {
    const ip = serverDecryption.decrypt(key);

    Log.info(`Rate limit exceeded for IP: ${ip} on ${limiterName} limiter`);
    const limitDetail = limiterName === 'Long' ? '20分で40回まで許容。6時間ブロック'
        : limiterName === 'Middle' ? '2分で9回まで許容。30分ブロック'
            : limiterName === 'Short' ? '1分で5回まで許容。30分ブロック'
                : '2秒で4回まで許容。30分ブロック';

    const message = `
🚨 **大量アクセスを検知しました**
**IP:** ${ip}
**Limiter:** ${limiterName}
**Detail:** ${limitDetail}
**Connection IP:** ${connectionIp}
    `.trim();

    await discordNotifyService.sendMessage(message);
}

function rateLimitExceededResponse(c: Context): Response {
    return respondWithError(c, 'Internal server error', 9999, 500);
}
