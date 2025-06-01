import { Context } from 'hono';
import { shadowBanCheckService } from '../service/ShadowBanCheckService';
import { Log } from '../util/Log';
import { DiscordChannel, discordNotifyService } from '../service/DiscordNotifyService';
import { respondWithError } from '../util/Response';
import { DelayUtil } from '../util/DelayUtil';
import { setBlockInfo } from '../util/AccessLogHelper';

export class ShadowBanCheckController {
    static async checkByUser(c: Context) {
        // Contextから既にパース済みのデータを取得
        const data = c.get('requestData') || {};

        // リクエストパラメータの取得(存在するかの検証はmiddlewareで行う)
        const screenName = data.screen_name;
        const checkSearchBan = data.searchban;
        const checkRepost = data.repost;
        const ip = c.get('ip') || '';

        try {
            const result = await shadowBanCheckService.checkShadowBanStatus(
                screenName,
                ip,
                checkSearchBan,
                checkRepost
            );

            return c.json(result);
        } catch (error) {
            Log.error('/api/check-by-userの不明なエラー:', error);
            setBlockInfo(c, "unknown", 9999);
            await discordNotifyService.notifyError(
                error instanceof Error ? error : new Error(String(error)),
                `API: check-by-user (screenName: ${screenName})`
            );
            await DelayUtil.randomDelay();

            return respondWithError(c, 'Internal server error', 9999, 500);
        }
    }

    static async checkByUserInner(c: Context) {
        // Contextから既にパース済みのデータを取得
        const data = c.get('requestData') || {};

        // リクエストパラメータの取得(存在するかの検証はmiddlewareで行う)
        const screenName = data.screen_name;
        const checkSearchBan = data.searchban;
        const checkRepost = data.repost;
        const ip = c.get('ip') || '';

        try {
            const result = await shadowBanCheckService.checkShadowBanStatus(
                screenName,
                ip,
                checkSearchBan,
                checkRepost
            );

            return c.json(result);
        } catch (error) {
            Log.error('/api/check-by-userの不明なエラー:', error);
            setBlockInfo(c, "unknown", 9999);
            await discordNotifyService.notifyError(
                error instanceof Error ? error : new Error(String(error)),
                `API: check-by-user (screenName: ${screenName})`
            );
            await DelayUtil.randomDelay();

            return respondWithError(c, 'Internal server error', 9999, 500);
        }
    }

    static async notifyNoTurnstileToken(screenName: string | undefined, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string, userAgent: string, referer: string): Promise<void> {
        const message = `
🚨 **APIを直接叩けなくするためのトークンがないcheck-by-userへのアクセスがあったので防御しました。**
**Screen Name:** ${screenName ?? 'No screen name'}
**Check Search Ban:** ${checkSearchBan ?? 'No Check Search Ban'}   
**Check Repost:** ${checkRepost ?? 'No Check Repost'}
**IP:** ${ip ?? 'No IP'}
**Connection IP:** ${connectionIp ?? 'No Connection IP'}
**User-Agent:** ${userAgent}
**Referer:** ${referer}
        `.trim();

        await discordNotifyService.sendMessage(message, DiscordChannel.INVALID_URL_PARAM);
    }

    static async notifyInvalidTurnstileToken(screenName: string | undefined,
        checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string,
        errorCodes: string[]): Promise<void> {
        const errorCodesList = errorCodes.length > 0
            ? errorCodes.map(code => `  - ${code}`).join("\n")
            : "None";

        const message = `
🚨 **APIを直接叩けなくするためのトークンが間違っているcheck-by-userへのアクセスがあったので防御しました。**
**Screen Name:** ${screenName ?? 'No screen name'}
**Check Search Ban:** ${checkSearchBan ?? 'No Check Search Ban'}   
**Check Repost:** ${checkRepost ?? 'No Check Repost'}
**IP:** ${ip ?? 'No IP'}
**Connection IP:** ${connectionIp ?? 'No Connection IP'}
**Error Codes:**
${errorCodesList}
        `.trim();

        await discordNotifyService.sendMessage(message, DiscordChannel.INVALID_URL_PARAM);
    }
}
