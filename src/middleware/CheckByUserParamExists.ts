import { Context, Next } from 'hono'
import { Log } from '../util/Log'
import { discordNotifyService } from '../service/DiscordNotifyService'
import { DelayUtil } from '../util/DelayUtil'
import { respondWithError } from '../util/Response'
import { serverDecryption } from '../util/ServerDecryption'
import { ErrorCodes } from '../errors/ErrorCodes'
import { setBlockInfo, BlockReasons } from '../util/AccessLogHelper'

export const checkByUserParamExists = async (c: Context, next: Next) => {
    // リクエストパラメータの取得と検証
    const data = await c.req.json();
    const screenName = data.screen_name;
    const checkSearchBan = data.searchban;
    const checkRepost = data.repost;
    const encryptedIp = data.key;

    // 接続元IPを取得（プロキシやロードバランサー経由のリクエストに対応）
    const connectionIp = c.req.header('x-forwarded-for') ||
        c.req.raw.headers.get('x-forwarded-for') ||
        c.req.header('x-real-ip') ||
        c.env?.remoteAddress ||
        'unknown';

    // TODO checkSearchBanとcheckRepostの値はnullにならないのでは？
    if (!screenName || checkSearchBan == null || checkRepost == null || !encryptedIp) {
        const ip = encryptedIp ? await serverDecryption.decrypt(encryptedIp) : '';
        Log.error('パラメータが足りないcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
        await notifyParamlessRequest(screenName, checkSearchBan, checkRepost, ip, connectionIp);
        setBlockInfo(c, BlockReasons.MISSING_PARAMETERS, ErrorCodes.MISSING_CHECK_BY_USER_PARAMS);
        await DelayUtil.randomDelay();
        return respondWithError(c, 'Validation failed.', ErrorCodes.MISSING_CHECK_BY_USER_PARAMS, 400);
    }

    await next()
}

async function notifyParamlessRequest(screenName: string | undefined, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
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
