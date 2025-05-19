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
        let screenName: string | undefined = undefined;

        try {
            // リクエストパラメータの取得と検証
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

            // TODO checkSearchBanとcheckRepostの値はnullにならないのでは？
            if (!screenName || checkSearchBan == null || checkRepost == null || !encryptedIp) {
                Log.error('パラメータが足りないcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
                await ShadowBanCheckController.notifyParamlessRequest(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                await DelayUtil.randomDelay();
                return respondWithError(c, 'Validation failed.', ErrorCodes.MISSING_CHECK_BY_USER_PARAMS, 400);
            }

            if (!ShadowBanCheckController.isValidIpFormat(ip)) {
                Log.error('IPが不正なcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
                await ShadowBanCheckController.notifyInvalidIp(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                await DelayUtil.randomDelay();
                return respondWithError(c, 'Validation failed.', ErrorCodes.INVALID_IP_FORMAT);
            }

            const settings = await systemSettingService.getAccessSettings();
            const blacklistEnabled = settings.blacklistEnabled;
            const whitelistEnabled = settings.whitelistEnabled;

            if (blacklistEnabled && await ipAccessControlService.isBlacklisted(ip)) {
                Log.error('ブラックリストに登録されているIPからのアクセスがありました。', { screenName, checkSearchBan, checkRepost, ip });
                ShadowBanCheckController.notifyBlockByBlacklist(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                await DelayUtil.randomDelay();
                return respondWithError(c, 'Internal server error', 99991, 500); // ブラックリストの存在隠蔽のため、エラーコードは9999
            }

            if (whitelistEnabled && !await ipAccessControlService.isWhitelisted(ip)) {
                Log.error('ホワイトリストに登録されていないIPからのアクセスがありました。', { screenName, checkSearchBan, checkRepost, ip });
                ShadowBanCheckController.notifyBlockByWhitelist(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                await DelayUtil.randomDelay();
                return respondWithError(c, 'Internal server error', 99992, 500); // ホワイトリストの存在隠蔽のため、エラーコードは9999
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
            await DelayUtil.randomDelay();

            return respondWithError(c, 'Internal server error', 9999, 500);
        }
    }

    static async listTest(c: Context) {

        let screenName: string | undefined = undefined;

        try {
            // リクエストパラメータの取得と検証
            const screenName = c.req.query('screen_name');
            const checkSearchBan = c.req.query('searchban') === 'true';
            const checkRepost = c.req.query('repost') === 'true';
            const encryptedIp = c.req.query('key');
            const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';

            // 接続元IPを取得（プロキシやロードバランサー経由のリクエストに対応）
            const connectionIp = c.req.header('x-forwarded-for') ||
                c.req.raw.headers.get('x-forwarded-for') ||
                c.req.header('x-real-ip') ||
                c.env?.remoteAddress ||
                'unknown';

            // TODO checkSearchBanとcheckRepostの値はnullにならないのでは？
            if (!screenName || checkSearchBan == null || checkRepost == null || !encryptedIp) {
                Log.error('パラメータが足りないcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
                await ShadowBanCheckController.notifyParamlessRequest(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                await DelayUtil.randomDelay();
                return respondWithError(c, 'Validation failed.', ErrorCodes.MISSING_CHECK_BY_USER_PARAMS, 400);
            }

            if (!ShadowBanCheckController.isValidIpFormat(ip)) {
                Log.error('IPが不正なcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
                await ShadowBanCheckController.notifyInvalidIp(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                await DelayUtil.randomDelay();
                return respondWithError(c, 'Validation failed.', ErrorCodes.INVALID_IP_FORMAT);
            }

            const settings = await systemSettingService.getAccessSettings();
            const blacklistEnabled = settings.blacklistEnabled;
            const whitelistEnabled = settings.whitelistEnabled;

            if (blacklistEnabled && await ipAccessControlService.isBlacklisted(ip)) {
                Log.error('ブラックリストに登録されているIPからのアクセスがありました。', { screenName, checkSearchBan, checkRepost, ip });
                ShadowBanCheckController.notifyBlockByBlacklist(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                await DelayUtil.randomDelay();
                return respondWithError(c, 'Internal server error', 99991, 500); // ブラックリストの存在隠蔽のため、エラーコードは9999
            }

            if (whitelistEnabled && !await ipAccessControlService.isWhitelisted(ip)) {
                Log.error('ホワイトリストに登録されていないIPからのアクセスがありました。', { screenName, checkSearchBan, checkRepost, ip });
                ShadowBanCheckController.notifyBlockByWhitelist(screenName, checkSearchBan, checkRepost, ip, connectionIp);
                await DelayUtil.randomDelay();
                return respondWithError(c, 'Internal server error', 99992, 500); // ホワイトリストの存在隠蔽のため、エラーコードは9999
            }

            return c.json({ screenName, ip, checkSearchBan, checkRepost });

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

    static isValidIpFormat(ip: string): boolean {
        if (!ip) return false;

        // .で分割して要素が4つあるか確認
        const segments = ip.split('.');

        for (const segment of segments) {
            // 空文字・非数値・先頭ゼロ（ただし "0" はOK）をチェック
            if (
                !/^\d+$/.test(segment) || // 数字のみか？
                (segment.length > 1 && segment.startsWith('0')) || // 先頭ゼロ禁止（"0"はOK）
                Number(segment) < 0 ||
                Number(segment) > 255
            ) {
                return false;
            }
        }

        return true;
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

    static async notifyBlockByBlacklist(screenName: string, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
        await ShadowBanCheckController.notifyAccessIssue('blacklist', screenName, checkSearchBan, checkRepost, ip, connectionIp);
    }

    static async notifyBlockByWhitelist(screenName: string, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
        await ShadowBanCheckController.notifyAccessIssue('whitelist', screenName, checkSearchBan, checkRepost, ip, connectionIp);
    }

    static async notifyAccessIssue(
        issueType: 'blacklist' | 'whitelist',
        screenName: string,
        checkSearchBan: boolean,
        checkRepost: boolean,
        ip: string,
        connectionIp: string
    ): Promise<void> {
        const issueMessages: Record<string, string> = {
            blacklist: 'ブラックリストに登録されているIPからのアクセスがありました。',
            whitelist: 'ホワイトリストに登録されていないIPからのアクセスがありました。'
        };

        const message = `
🚨 **${issueMessages[issueType]}**
**Screen Name:** ${screenName}
**Check Search Ban:** ${checkSearchBan}
**Check Repost:** ${checkRepost}
**IP:** ${ip}
**Connection IP:** ${connectionIp}
        `.trim();

        await discordNotifyService.sendMessage(message);
    }
}
