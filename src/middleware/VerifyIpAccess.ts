import { Context, Next } from 'hono';
import { ErrorCodes } from '../errors/ErrorCodes';
import { ipAccessControlService } from '../service/IpAccessControlService';
import { systemSettingService } from '../service/SystemSettingService';
import { respondWithError } from '../util/Response';
import { serverDecryption } from '../util/ServerDecryption';
import { discordNotifyService } from '../service/DiscordNotifyService';
import { DelayUtil } from '../util/DelayUtil';
import { Log } from '../util/Log';
import { setBlockInfo, BlockReasons } from '../util/AccessLogHelper';

export const verifyIpAccess = async (c: Context, next: Next) => {
    const data = await c.req.json();
    const screenName = data.screen_name;
    const checkSearchBan = data.searchban;
    const checkRepost = data.repost;
    const encryptedIp = data.key;

    const ip = encryptedIp ? await serverDecryption.decrypt(encryptedIp) : '';
    const connectionIp = c.req.header('x-forwarded-for') ||
        c.req.raw.headers.get('x-forwarded-for') ||
        c.req.header('x-real-ip') ||
        c.env?.remoteAddress ||
        'unknown';

    if (!isValidIpFormat(ip)) {
        Log.error('IPが不正なcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
        await notifyInvalidIp(screenName, checkSearchBan, checkRepost, ip, connectionIp);
        setBlockInfo(c, BlockReasons.INVALID_IP_FORMAT, ErrorCodes.INVALID_IP_FORMAT);
        await DelayUtil.randomDelay();
        return respondWithError(c, 'Validation failed.', ErrorCodes.INVALID_IP_FORMAT);
    }

    const settings = await systemSettingService.getAccessSettings();
    if (settings.blacklistEnabled && await ipAccessControlService.isBlacklisted(ip)) {
        Log.error('ブラックリストに登録されているIPからのアクセスがありました。', { screenName, checkSearchBan, checkRepost, ip });
        await notifyBlockByBlacklist(screenName, checkSearchBan, checkRepost, ip, connectionIp);
        setBlockInfo(c, BlockReasons.IP_BLACKLISTED, 9999);
        await DelayUtil.randomDelay();
        return respondWithError(c, 'Internal server error', 9999, 500); // ブラックリストの存在隠蔽のため、エラーコードは9999
    }

    if (settings.whitelistEnabled && !await ipAccessControlService.isWhitelisted(ip)) {
        Log.error('ホワイトリストに登録されていないIPからのアクセスがありました。', { screenName, checkSearchBan, checkRepost, ip });
        await notifyBlockByWhitelist(screenName, checkSearchBan, checkRepost, ip, connectionIp);
        setBlockInfo(c, BlockReasons.IP_NOT_WHITELISTED, 9999);
        await DelayUtil.randomDelay();
        return respondWithError(c, 'Internal server error', 9999, 500); // ホワイトリストの存在隠蔽のため、エラーコードは9999
    }

    c.set('ip', ip);
    await next();
};

function isValidIpFormat(ip: string): boolean {
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

async function notifyInvalidIp(screenName: string | undefined, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
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


async function notifyBlockByBlacklist(screenName: string, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
    await notifyAccessIssue('blacklist', screenName, checkSearchBan, checkRepost, ip, connectionIp);
}

async function notifyBlockByWhitelist(screenName: string, checkSearchBan: boolean, checkRepost: boolean, ip: string, connectionIp: string): Promise<void> {
    await notifyAccessIssue('whitelist', screenName, checkSearchBan, checkRepost, ip, connectionIp);
}

async function notifyAccessIssue(
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