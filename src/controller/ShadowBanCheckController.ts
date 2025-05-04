import { Context } from 'hono';
import { serverDecryption } from '../util/ServerDecryption';
import { shadowBanCheckService } from '../service/ShadowBanCheckService';
import { Log } from '../util/Log';
import { discordNotifyService } from '../service/DiscordNotifyService';

export class ShadowBanCheckController {
    static async checkByUser(c: Context) {
        let screenName: string | undefined = undefined;

        return c.json({
            error: 'Internal server error',
            details: 'Unknown error'
        }, 500);
        // try {
        //     // リクエストパラメータの取得と検証
        //     screenName = c.req.query('screen_name');
        //     if (!screenName) {
        //         return c.json({ error: 'screen_name parameter is required' }, 400);
        //     }

        //     const checkSearchBan = c.req.query('searchban') === 'true';
        //     const checkRepost = c.req.query('repost') === 'true';

        //     const encryptedIp = c.req.query('key');
        //     const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';

        //     // IP形式の検証
        //     if (!ShadowBanCheckController.isValidIpFormat(ip)) {
        //         return c.json({ error: 'Validation failed.' }, 403);
        //     }

        //     // サービスに処理を委譲
        //     const result = await shadowBanCheckService.checkShadowBanStatus(
        //         screenName,
        //         ip,
        //         checkSearchBan,
        //         checkRepost
        //     );

        //     return c.json(result);

        // } catch (error) {
        //     // エラーハンドリング
        //     Log.error('/api/check-by-userの不明なエラー:', error);

        //     // Discordに通知を送信
        //     await discordNotifyService.notifyError(
        //         error instanceof Error ? error : new Error(String(error)),
        //         `API: check-by-user (screenName: ${screenName})`
        //     );

        //     return c.json({
        //         error: 'Internal server error',
        //         details: error instanceof Error ? error.message : 'Unknown error'
        //     }, 500);
        // }
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

}