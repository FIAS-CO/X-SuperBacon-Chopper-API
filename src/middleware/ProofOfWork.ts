import { Context, Next } from 'hono'
import { PowService } from '../service/PowService'
import { Log } from '../util/Log'
import { discordNotifyService } from '../service/DiscordNotifyService'
import { DelayUtil } from '../util/DelayUtil'
import { respondWithError } from '../util/Response'
import { serverDecryption } from '../util/ServerDecryption'

export const pow = async (c: Context, next: Next) => {
    const challenge = c.req.header('X-Session-Token') || '';
    const nonce = c.req.header('X-Request-Hash') || '';

    if (!await PowService.verifyAsync(challenge, nonce)) {
        const data = await c.req.json();
        const screenName = data.screen_name;
        const checkSearchBan = data.searchban;
        const checkRepost = data.repost;
        const encryptedIp = data.key;
        const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';
        const connectionIp = c.req.header('x-forwarded-for') ||
            c.req.raw.headers.get('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.env?.remoteAddress ||
            'unknown';

        Log.error('PoWチャレンジの失敗がありました', { screenName, challenge, nonce });
        notifyPowFailed(screenName, checkSearchBan, checkRepost, ip, connectionIp);
        await DelayUtil.randomDelay();
        return respondWithError(c, 'Internal server error', 99991, 500); // ブラックリストの存在隠蔽のため、エラーコードは9999
    }

    await next()
}

async function notifyPowFailed(screenName: string, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
    const message = `
🚨 **パラーメータの足りないcheck-by-userへのアクセスがあったので防御しました。**
**Screen Name:** ${screenName ?? 'No screen name'}
**Check Search Ban:** ${checkSearchBan ?? 'No Check Search Ban'}   
**Check Repost:** ${checkRepost ?? 'No Check Repost'}
**IP:** ${ip ?? 'No IP'}
**Connection IP:** ${connectionIp ?? 'No Connection IP'}
        `.trim();

    await discordNotifyService.sendMessage(message);
}