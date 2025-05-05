import { Context } from 'hono';
import { serverDecryption } from '../util/ServerDecryption';
import { shadowBanCheckService } from '../service/ShadowBanCheckService';
import { Log } from '../util/Log';
import { discordNotifyService } from '../service/DiscordNotifyService';
import { TurnstileValidator } from '../util/TurnstileValidator';
import { StatusCode } from 'hono/utils/http-status';
import { ErrorCodes } from '../errors/ErrorCodes';

export class ShadowBanCheckController {
    static async checkByUser(c: Context) {
        let screenName: string | undefined = undefined;

        try {
            const data = await c.req.json();
            // リクエストパラメータの取得と検証
            screenName = data.screen_name;
            if (!screenName) {
                return ShadowBanCheckController.respondWithError(c, ErrorCodes.MISSING_SCREEN_NAME, 400);
            }

            const checkSearchBan = data.searchban;
            const checkRepost = data.repost;
            const encryptedIp = data.key;
            const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';

            const turnstileToken = data.turnstileToken;
            if (!turnstileToken) {
                return ShadowBanCheckController.respondWithError(c, ErrorCodes.MISSING_TURNSTILE_TOKEN);
            }

            const validator = new TurnstileValidator(process.env.TURNSTILE_SECRET_KEY!);
            const isValid = await validator.verify(turnstileToken, ip);

            if (!isValid) {
                return ShadowBanCheckController.respondWithError(c, ErrorCodes.INVALID_TURNSTILE_TOKEN);
            }

            // IP形式の検証
            if (!ShadowBanCheckController.isValidIpFormat(ip)) {
                return ShadowBanCheckController.respondWithError(c, ErrorCodes.INVALID_IP_FORMAT);
            }

            // サービスに処理を委譲
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

    static async checkByUserInner(c: Context) {
        let screenName: string | undefined = undefined;

        try {
            // リクエストパラメータの取得と検証
            screenName = c.req.query('screen_name');
            if (!screenName) {
                return c.json({ error: 'screen_name parameter is required' }, 400);
            }

            const checkSearchBan = c.req.query('searchban') === 'true';
            const checkRepost = c.req.query('repost') === 'true';

            const encryptedIp = c.req.query('key');
            const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';

            // サービスに処理を委譲
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

    static respondWithError(c: Context, errorCode: number, httpStatus = 403) {
        return c.json(
            {
                message: 'Validation failed.',
                code: errorCode
            },
            httpStatus as StatusCode
        );
    }
}
