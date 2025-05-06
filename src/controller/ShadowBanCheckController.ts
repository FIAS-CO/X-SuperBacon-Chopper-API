import { Context } from 'hono';
import { serverDecryption } from '../util/ServerDecryption';
import { shadowBanCheckService } from '../service/ShadowBanCheckService';
import { Log } from '../util/Log';
import { discordNotifyService } from '../service/DiscordNotifyService';
import { TurnstileValidator } from '../util/TurnstileValidator';
import { ErrorCodes } from '../errors/ErrorCodes';
import { respondWithError } from '../util/Response';

export class ShadowBanCheckController {
    static async checkByUser(c: Context) {
        let screenName: string | undefined = undefined;

        try {
            const data = await c.req.json();
            // リクエストパラメータの取得と検証
            screenName = data.screen_name;
            const checkSearchBan = data.searchban;
            const checkRepost = data.repost;
            const encryptedIp = data.key;
            const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';

            // 接続元IPを取得（プロキシやロードバランサー経由のリクエストに対応）
            const connectionIp = c.req.header('x-forwarded-for') ||
                c.req.raw.headers.get('x-forwarded-for') ||
                c.req.header('x-real-ip') ||
                c.env?.remoteAddress ||
                'unknown';

            if (!screenName || checkSearchBan == null || checkRepost == null || !encryptedIp) {
                Log.error('パラメータが足りないcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
                await ShadowBanCheckController.notifyParamlessRequest(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                return respondWithError(c, 'Validation failed.', ErrorCodes.MISSING_CHECK_BY_USER_PARAMS, 400);
            }

            if (!ShadowBanCheckController.isValidIpFormat(ip)) {
                Log.error('IPが不正なcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
                await ShadowBanCheckController.notifyInvalidIp(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                return respondWithError(c, 'Validation failed.', ErrorCodes.INVALID_IP_FORMAT);
            }

            const turnstileToken = data.turnstileToken;
            if (!turnstileToken) {
                Log.error('APIを直接叩けなくするためのトークンがないcheck-by-userへのアクセスがあったので防御しました。'
                    , { screenName, checkSearchBan, checkRepost, ip });
                await ShadowBanCheckController.notifyNoTurnstileToken(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                return respondWithError(c, 'Validation failed.', ErrorCodes.MISSING_TURNSTILE_TOKEN);
            }

            const validator = new TurnstileValidator(process.env.TURNSTILE_SECRET_KEY!);
            const isValid = await validator.verify(turnstileToken, ip);

            if (!isValid) {
                Log.error('APIを直接叩けなくするためのトークンが間違っているcheck-by-userへのアクセスがあったので防御しました。'
                    , { screenName, checkSearchBan, checkRepost, ip });
                await ShadowBanCheckController.notifyInvalidTurnstileToken(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                return respondWithError(c, 'Validation failed.', ErrorCodes.INVALID_TURNSTILE_TOKEN);
            }

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

            return respondWithError(c, 'Internal server error', 9999, 500);
        }
    }

    static async checkByUserInner(c: Context) {
        let screenName: string | undefined = undefined;

        try {
            screenName = c.req.query('screen_name');
            if (!screenName) {
                return c.json({ error: 'screen_name parameter is required' }, 400);
            }

            const checkSearchBan = c.req.query('searchban') === 'true';
            const checkRepost = c.req.query('repost') === 'true';

            const encryptedIp = c.req.query('key');
            const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';

            const result = await shadowBanCheckService.checkShadowBanStatus(
                screenName,
                ip,
                checkSearchBan,
                checkRepost
            );

            return c.json(result);

        } catch (error) {
            // エラーハンドリング
            Log.error('/api/check-by-userの不明なエラー:', error);

            // Discordに通知を送信
            await discordNotifyService.notifyError(
                error instanceof Error ? error : new Error(String(error)),
                `API: check-by-user (screenName: ${screenName})`
            );

            return c.json({
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            }, 500);
        }
    }

    static isValidIpFormat(ip: string): boolean {
        if (!ip) return false;

        // .で分割して要素が4つあるか確認
        const parts = ip.split('.');
        return parts.length === 4;
    }
    static async notifyParamlessRequest(screenName: string | undefined, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
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

    static async notifyInvalidIp(screenName: string | undefined, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
        const message = `
🚨 **IPが不正なcheck-by-userへのアクセスがあったので防御しました。**
**Screen Name:** ${screenName ?? 'No screen name'}
**Check Search Ban:** ${checkSearchBan ?? 'No Check Search Ban'}   
**Check Repost:** ${checkRepost ?? 'No Check Repost'}
**IP:** ${ip ?? 'No IP'}
**Connection IP:** ${connectionIp ?? 'No Connection IP'}
        `.trim();

        await discordNotifyService.sendMessage(message);
    }

    static async notifyNoTurnstileToken(screenName: string | undefined, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
        const message = `
🚨 **APIを直接叩けなくするためのトークンがないcheck-by-userへのアクセスがあったので防御しました。**
**Screen Name:** ${screenName ?? 'No screen name'}
**Check Search Ban:** ${checkSearchBan ?? 'No Check Search Ban'}   
**Check Repost:** ${checkRepost ?? 'No Check Repost'}
**IP:** ${ip ?? 'No IP'}
**Connection IP:** ${connectionIp ?? 'No Connection IP'}
        `.trim();

        await discordNotifyService.sendMessage(message);
    }

    static async notifyInvalidTurnstileToken(screenName: string | undefined, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
        const message = `
🚨 **APIを直接叩けなくするためのトークンが間違っているcheck-by-userへのアクセスがあったので防御しました。**
**Screen Name:** ${screenName ?? 'No screen name'}
**Check Search Ban:** ${checkSearchBan ?? 'No Check Search Ban'}   
**Check Repost:** ${checkRepost ?? 'No Check Repost'}
**IP:** ${ip ?? 'No IP'}
**Connection IP:** ${connectionIp ?? 'No Connection IP'}
        `.trim();

        await discordNotifyService.sendMessage(message);
    }
}
