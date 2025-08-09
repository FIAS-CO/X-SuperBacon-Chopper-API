import { Context, Next } from 'hono';
import { ErrorCodes } from '../errors/ErrorCodes';
import { ipAccessControlService } from '../service/IpAccessControlService';
import { systemSettingService } from '../service/SystemSettingService';
import { respondWithError } from '../util/Response';
import { DiscordChannel, discordNotifyService } from '../service/DiscordNotifyService';
import { DelayUtil } from '../util/DelayUtil';
import { Log } from '../util/Log';
import { setBlockInfo, BlockReasons } from '../util/AccessLogHelper';
import { isIP } from 'net';

export const verifyIpAccess = async (c: Context, next: Next) => {
    const data = c.get('requestData') || {};
    const screenName = data.screen_name || 'unknown';
    const checkSearchBan = data.searchban;
    const checkRepost = data.repost;

    const ip = c.get('ip') || '';
    const connectionIp = c.get('connectionIp') || 'unknown';

    if (!isValidIpFormat(ip)) {
        Log.error('IPが不正なcheck-by-userへのアクセスがあったので防御しました。', { screenName, checkSearchBan, checkRepost, ip });
        await notifyInvalidIp(screenName, checkSearchBan, checkRepost, ip, connectionIp);
        setBlockInfo(c, BlockReasons.INVALID_IP_FORMAT, ErrorCodes.INVALID_IP_FORMAT);
        await DelayUtil.randomDelay();
        // return respondWithError(c, 'Validation failed.', ErrorCodes.INVALID_IP_FORMAT);
        return respondWithError(c, 'Internal server error', 9999, 500); // ブラックリストの存在隠蔽のため、エラーコードは9999
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

    await next();
};

function isValidIpFormat(ip: string): boolean {
    if (!ip) return false;

    // Node.jsの標準ライブラリnetを使用してIPアドレスの形式をチェック
    // isIP関数は、IPv4の場合は4、IPv6の場合は6、無効な場合は0を返す
    const ipVersion = isIP(ip);
    return ipVersion !== 0; // 0以外（つまり4または6）であれば有効
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

    await discordNotifyService.sendMessage(message, DiscordChannel.IP_ACCESS_BLOCK);
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

    await discordNotifyService.sendMessage(message, DiscordChannel.ACCESS_CONTROL_BLOCK);
}