import { Context, Next } from 'hono'
import { Log } from '../util/Log'
import { DiscordChannel, discordNotifyService } from '../service/DiscordNotifyService'
import { DelayUtil } from '../util/DelayUtil'
import { respondWithError } from '../util/Response'
import { ErrorCodes } from '../errors/ErrorCodes'
import { setBlockInfo, BlockReasons } from '../util/AccessLogHelper'

export const checkByUserParamExists = async (c: Context, next: Next) => {
    // Contextから既にパース済みのデータを取得
    const data = c.get('requestData') || {};

    const screenName = data.screen_name;
    const checkSearchBan = data.searchban;
    const checkRepost = data.repost;
    const encryptedIp = data.key;

    if (!screenName || checkSearchBan == null || checkRepost == null || !encryptedIp) {
        const ip = c.get('ip') || '';
        const connectionIp = c.get('connectionIp') || 'unknown';
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

    await discordNotifyService.sendMessage(message, DiscordChannel.INVALID_URL_PARAM);
}
