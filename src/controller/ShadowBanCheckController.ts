import { Context } from 'hono';
import { serverDecryption } from '../util/ServerDecryption';
import { shadowBanCheckService } from '../service/ShadowBanCheckService';
import { Log } from '../util/Log';
import { discordNotifyService } from '../service/DiscordNotifyService';
import { ErrorCodes } from '../errors/ErrorCodes';
import { respondWithError } from '../util/Response';
import { ipAccessControlService } from '../service/IpAccessControlService';
import { systemSettingService } from '../service/SystemSettingService';
import { DelayUtil } from '../util/DelayUtil';

export class ShadowBanCheckController {
    static async checkByUser(c: Context) {

        return respondWithError(c, 'Internal server error', 9998, 500);
        // let screenName: string | undefined = undefined;

        // try {
        //     const data = await c.req.json();
        //     // リクエストパラメータの取得と検証
        //     screenName = data.screen_name;
        //     const checkSearchBan = data.searchban;
        //     const checkRepost = data.repost;
        //     const encryptedIp = data.key;
        //     const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';

        //     // 接続元IPを取得（プロキシやロードバランサー経由のリクエストに対応）
        //     const connectionIp = c.req.header('x-forwarded-for') ||
        //         c.req.raw.headers.get('x-forwarded-for') ||
        //         c.req.header('x-real-ip') ||
        //         c.env?.remoteAddress ||
        //         'unknown';

        //     if (!screenName || checkSearchBan == null || checkRepost == null || !encryptedIp) {
        //         Log.error('パラメータが足りないcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
        //         await ShadowBanCheckController.notifyParamlessRequest(screenName, checkSearchBan, checkRepost, ip, connectionIp);
        //         return respondWithError(c, 'Validation failed.', ErrorCodes.MISSING_CHECK_BY_USER_PARAMS, 400);
        //     }

        //     if (!ShadowBanCheckController.isValidIpFormat(ip)) {
        //         Log.error('IPが不正なcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
        //         await ShadowBanCheckController.notifyInvalidIp(screenName, checkSearchBan, checkRepost, ip, connectionIp);
        //         return respondWithError(c, 'Validation failed.', ErrorCodes.INVALID_IP_FORMAT);
        //     }

        //     const turnstileToken = data.turnstileToken;
        //     if (!turnstileToken) {
        //         const headers = c.req.raw.headers;
        //         const userAgent = headers.get('user-agent') || 'なし';
        //         const referer = headers.get('referer') || 'なし';

        //         Log.error('APIを直接叩けなくするためのトークンがないcheck-by-userへのアクセスがあったので防御しました。'
        //             , { screenName, checkSearchBan, checkRepost, ip, connectionIp, userAgent, referer });
        //         await ShadowBanCheckController.notifyNoTurnstileToken(screenName, checkSearchBan, checkRepost, ip, connectionIp, userAgent, referer);
        //         return respondWithError(c, 'Validation failed.', ErrorCodes.MISSING_TURNSTILE_TOKEN);
        //     }

        //     const validator = new TurnstileValidator(process.env.TURNSTILE_SECRET_KEY!);
        //     const verificationResult = await validator.verify(turnstileToken, ip);

        //     if (!verificationResult.isValid) {
        //         // エラーコードを含めてログ出力
        //         Log.error('APIを直接叩けなくするためのトークンが無効なcheck-by-userへのアクセスがありました。',
        //             { screenName, checkSearchBan, checkRepost, ip, errorCodes: verificationResult.errorCodes });

        //         // Discordへの通知にエラーコードを含める
        //         await ShadowBanCheckController.notifyInvalidTurnstileToken(
        //             screenName,
        //             checkSearchBan,
        //             checkRepost,
        //             ip,
        //             connectionIp,
        //             verificationResult.errorCodes
        //         );

        //         // エラーコードに基づいて適切なエラーレスポンスを返す
        //         if (verificationResult.errorCodes?.includes("timeout-or-duplicate")) {
        //             return respondWithError(c, 'Validation failed.', ErrorCodes.DUPLICATE_TURNSTILE_TOKEN);
        //         } else {
        //             return respondWithError(c, 'Validation failed.', ErrorCodes.INVALID_TURNSTILE_TOKEN);
        //         }
        //     }
        //     const result = await shadowBanCheckService.checkShadowBanStatus(
        //         screenName,
        //         ip,
        //         checkSearchBan,
        //         checkRepost
        //     );

        //     return c.json(result);

        // } catch (error) {
        //     Log.error('/api/check-by-userの不明なエラー:', error);

        //     await discordNotifyService.notifyError(
        //         error instanceof Error ? error : new Error(String(error)),
        //         `API: check-by-user (screenName: ${screenName})`
        //     );

        //     return respondWithError(c, 'Internal server error', 9999, 500);
        // }
    }

    static async checkByUserInner(c: Context) {
        const data = await c.req.json();
        const screenName = data.screen_name;

        try {
            // リクエストパラメータの取得(存在するかの検証はmiddlewareで行う)
            const checkSearchBan = data.searchban;
            const checkRepost = data.repost;
            const encryptedIp = data.key;
            const ip = c.get('ip') || (encryptedIp ? serverDecryption.decrypt(encryptedIp) : '');

            const result = await shadowBanCheckService.checkShadowBanStatus(
                screenName,
                ip,
                checkSearchBan,
                checkRepost
            );

            return c.json(result);
        } catch (error) {
            Log.error('/api/check-by-userの不明なエラー:', error);

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

        await discordNotifyService.sendMessage(message);
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

        await discordNotifyService.sendMessage(message);
    }
}
