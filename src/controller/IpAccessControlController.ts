import { Context } from 'hono';
import { ipAccessControlService } from '../service/IpAccessControlService';
import { Log } from '../util/Log';
import { respondWithDetailedError } from '../util/Response';
import { discordNotifyService } from '../service/DiscordNotifyService';
import { IP_ACCESS_TYPE } from '../types/Types';

export class IpAccessControlController {
    /**
     * ブラックリストを取得
     */
    static async getBlacklist(c: Context) {
        try {
            const list = await ipAccessControlService.getList(IP_ACCESS_TYPE.BLACKLIST);
            return c.json(list);
        } catch (error) {
            Log.error('Error getting blacklist:', error);
            return respondWithDetailedError(c, error as Error, 9999, 500);
        }
    }

    /**
     * ホワイトリストを取得
     */
    static async getWhitelist(c: Context) {
        try {
            const list = await ipAccessControlService.getList(IP_ACCESS_TYPE.WHITELIST);
            return c.json(list);
        } catch (error) {
            Log.error('Error getting whitelist:', error);
            return respondWithDetailedError(c, error as Error, 9999, 500);
        }
    }

    /**
     * ブラックリストを置き換え
     */
    static async replaceBlacklist(c: Context) {
        try {
            const data = await c.req.json();
            const { ips } = data;

            if (!ips) {
                return respondWithDetailedError(c, new Error('IPs are required'), 3002, 400);
            }

            // 改行で区切られたIPリストを配列に変換
            const ipList = ips.split(/\r?\n/).map((ip: string) => ip.trim()).filter((ip: string) => ip);

            if (ipList.length === 0) {
                return respondWithDetailedError(c, new Error('No valid IPs provided'), 3005, 400);
            }

            const result = await ipAccessControlService.replaceBlacklist(ipList);

            await notifyIpListReplaced(IP_ACCESS_TYPE.BLACKLIST, result.count);
            return c.json({
                success: true,
                message: `Blacklist replaced with ${result.count} IPs`,
                added: result.added
            });
        } catch (error) {
            Log.error('Error replacing blacklist:', error);
            return respondWithDetailedError(c, error as Error, 9999, 500);
        }
    }

    /**
     * ホワイトリストを置き換え
     */
    static async replaceWhitelist(c: Context) {
        try {
            const data = await c.req.json();
            const { ips } = data;

            if (!ips) {
                return respondWithDetailedError(c, new Error('IPs are required'), 3002, 400);
            }

            // 改行で区切られたIPリストを配列に変換
            const ipList = ips.split(/\r?\n/).map((ip: string) => ip.trim()).filter((ip: string) => ip);

            if (ipList.length === 0) {
                return respondWithDetailedError(c, new Error('No valid IPs provided'), 3005, 400);
            }

            const result = await ipAccessControlService.replaceWhitelist(ipList);

            await notifyIpListReplaced(IP_ACCESS_TYPE.WHITELIST, result.count);
            return c.json({
                success: true,
                message: `Whitelist replaced with ${result.count} IPs`,
                added: result.added
            });
        } catch (error) {
            Log.error('Error replacing whitelist:', error);
            return respondWithDetailedError(c, error as Error, 9999, 500);
        }
    }
}

/**
 * IPリスト置換を通知
 */
async function notifyIpListReplaced(type: string, count: number): Promise<void> {
    const message = `
🔒 **IPリスト置換**
**リスト種別:** ${type === IP_ACCESS_TYPE.BLACKLIST ? "ブラックリスト" : "ホワイトリスト"}
**登録件数:** ${count}件
**操作:** 既存リスト削除後に新規登録
        `.trim();

    await discordNotifyService.sendMessage(message);
}