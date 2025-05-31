import { Context } from 'hono';
import { ipAccessControlService } from '../service/IpAccessControlService';
import { Log } from '../util/Log';
import { respondWithDetailedError } from '../util/Response';
import { DiscordChannel, discordNotifyService } from '../service/DiscordNotifyService';
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

    /**
     * ブラックリストにIPを追加
     */
    static async addBlacklist(c: Context) {
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

            const result = await ipAccessControlService.addBlacklist(ipList);

            await notifyIpListAdded(IP_ACCESS_TYPE.BLACKLIST, result.count);
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
     * ホワイトリストにIPを追加
     */
    static async addWhitelist(c: Context) {
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

            const result = await ipAccessControlService.addWhitelist(ipList);

            await notifyIpListAdded(IP_ACCESS_TYPE.WHITELIST, result.count);
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

    /**
     * ブラックリストを削除
     */
    static async deleteBlacklist(c: Context) {
        try {
            const result = await ipAccessControlService.deleteBlacklist();
            await notifyIpListDeleted(IP_ACCESS_TYPE.BLACKLIST, result.count);
            return c.json({
                success: true,
                message: `Blacklist deleted, ${result.count} IPs removed`
            });
        } catch (error) {
            Log.error('Error deleting blacklist:', error);
            return respondWithDetailedError(c, error as Error, 9999, 500);
        }
    }

    /**
     * ホワイトリストを削除
     */
    static async deleteWhitelist(c: Context) {
        try {
            const result = await ipAccessControlService.deleteWhitelist();
            await notifyIpListDeleted(IP_ACCESS_TYPE.WHITELIST, result.count);
            return c.json({
                success: true,
                message: `Whitelist deleted, ${result.count} IPs removed`
            });
        } catch (error) {
            Log.error('Error deleting whitelist:', error);
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

    await discordNotifyService.sendMessage(message, DiscordChannel.ACCESS_CONTROL_INFO);
}

/**
 * IPリスト追加を通知
 */
async function notifyIpListAdded(type: string, count: number): Promise<void> {
    const message = `
🔒 **IPリスト追加**
**リスト種別:** ${type === IP_ACCESS_TYPE.BLACKLIST ? "ブラックリスト" : "ホワイトリスト"}
**追加件数:** ${count}件
**操作:** 既存リストに追加
        `.trim();

    await discordNotifyService.sendMessage(message, DiscordChannel.ACCESS_CONTROL_INFO);
}

/**
 * IPリスト削除を通知
 */
async function notifyIpListDeleted(type: string, count: number): Promise<void> {
    const message = ` 
🔒 **IPリスト削除**
**リスト種別:** ${type === IP_ACCESS_TYPE.BLACKLIST ? "ブラックリスト" : "ホワイトリスト"}
**削除件数:** ${count}件
**操作:** 既存リスト削除
        `.trim();

    await discordNotifyService.sendMessage(message, DiscordChannel.ACCESS_CONTROL_INFO);
}