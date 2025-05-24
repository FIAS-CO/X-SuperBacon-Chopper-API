import { Context, Next } from 'hono';
import { respondWithError } from '../util/Response';
import { serverDecryption } from '../util/ServerDecryption';
import { discordNotifyService } from '../service/DiscordNotifyService';
import { DelayUtil } from '../util/DelayUtil';
import { Log } from '../util/Log';
import { setBlockInfo, BlockReasons } from '../util/AccessLogHelper';

// 許可されたドメインのリスト
const ALLOWED_DOMAINS = [
    'localhost',
    '127.0.0.1',
    'x-shadowban-checker.fia-s.com',
];

export const verifyReferer = async (c: Context, next: Next) => {
    const referer = c.req.header('referer') || c.req.header('origin') || '';

    // Refererが空の場合は直接アクセスとみなしてブロック
    if (!referer) {
        return await handleSuspiciousReferer(c, 'No referer header', '');
    }

    let domain: string;
    try {
        const url = new URL(referer);
        domain = url.hostname;
    } catch (error) {
        return await handleSuspiciousReferer(c, 'Invalid referer URL', referer);
    }

    // ドメインが許可リストにない場合はブロック
    if (!ALLOWED_DOMAINS.includes(domain)) {
        return await handleSuspiciousReferer(c, 'Unauthorized domain', domain);
    }

    await next();
};

async function handleSuspiciousReferer(c: Context, reason: string, domain: string): Promise<Response> {
    const data = await getRequestData(c);

    Log.error(`不審なドメインからのアクセス: ${reason}`, {
        domain,
        screenName: data.screenName,
        ip: data.ip
    });

    await notifySuspiciousDomain({
        reason,
        domain,
        screenName: data.screenName,
        checkSearchBan: data.checkSearchBan,
        checkRepost: data.checkRepost,
        ip: data.ip,
        connectionIp: data.connectionIp,
        userAgent: data.userAgent,
        referer: c.req.header('referer') || 'なし'
    });

    setBlockInfo(c, `${BlockReasons.SUSPICIOUS_REFERER}: ${reason}`, 9999);
    await DelayUtil.randomDelay();

    return respondWithError(c, 'Internal server error', 9999, 500);
}

type RequestData = {
    screenName: string;
    checkSearchBan: string;
    checkRepost: string;
    ip: string;
    connectionIp: string;
    userAgent: string;
};

async function getRequestData(c: Context): Promise<RequestData> {
    let data: any = {};
    try {
        data = await c.req.json();
    } catch {
        // JSONパース失敗時は空オブジェクト
    }

    const connectionIp = c.req.header('x-forwarded-for') ||
        c.req.raw.headers.get('x-forwarded-for') ||
        c.req.header('x-real-ip') ||
        c.env?.remoteAddress ||
        'unknown';

    const userAgent = c.req.header('user-agent') || 'なし';

    return {
        screenName: data.screen_name ?? 'No screen name',
        checkSearchBan: data.searchban ?? 'No Check Search Ban',
        checkRepost: data.repost ?? 'No Check Repost',
        ip: data.key ? await serverDecryption.decrypt(data.key) : 'No IP',
        connectionIp,
        userAgent
    };
}

type NotifyData = {
    reason: string;
    domain: string;
    screenName: string;
    checkSearchBan: string;
    checkRepost: string;
    ip: string;
    connectionIp: string;
    userAgent: string;
    referer: string;
};

async function notifySuspiciousDomain(data: NotifyData): Promise<void> {
    const message = `
🚨 **不審なドメインからのアクセス: ${data.reason}**
**Domain:** ${data.domain}
**Screen Name:** ${data.screenName}
**Check Search Ban:** ${data.checkSearchBan}
**Check Repost:** ${data.checkRepost}
**IP:** ${data.ip}
**Connection IP:** ${data.connectionIp}
**User-Agent:** ${data.userAgent}
**Referer:** ${data.referer}
    `.trim();

    await discordNotifyService.sendMessage(message);
}