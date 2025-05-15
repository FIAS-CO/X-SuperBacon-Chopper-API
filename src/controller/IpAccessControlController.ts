import { Context } from 'hono';
import { ipAccessControlService, AccessSettings } from '../service/IpAccessControlService';
import { Log } from '../util/Log';
import { respondWithError } from '../util/Response';
import { discordNotifyService } from '../service/DiscordNotifyService';

export class IpAccessControlController {
    /**
     * ブラックリストを取得
     */
    static async getBlacklist(c: Context) {
        try {
            const list = await ipAccessControlService.getList("blacklist");
            return c.json(list);
        } catch (error) {
            Log.error('Error getting blacklist:', error);
            return respondWithError(c, 'Internal server error', 9999, 500);
        }
    }

    /**
     * ホワイトリストを取得
     */
    static async getWhitelist(c: Context) {
        try {
            const list = await ipAccessControlService.getList("whitelist");
            return c.json(list);
        } catch (error) {
            Log.error('Error getting whitelist:', error);
            return respondWithError(c, 'Internal server error', 9999, 500);
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
                return respondWithError(c, 'IPs are required', 3002, 400);
            }

            // 改行で区切られたIPリストを配列に変換
            const ipList = ips.split(/\r?\n/).map((ip: string) => ip.trim()).filter((ip: string) => ip);

            if (ipList.length === 0) {
                return respondWithError(c, 'No valid IPs provided', 3005, 400);
            }

            const result = await ipAccessControlService.replaceBlacklist(ipList);

            await notifyIpListReplaced("blacklist", result.count);
            return c.json({
                success: true,
                message: `Blacklist replaced with ${result.count} IPs`,
                added: result.added
            });
        } catch (error) {
            Log.error('Error replacing blacklist:', error);
            return respondWithError(c, 'Internal server error', 9999, 500);
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
                return respondWithError(c, 'IPs are required', 3002, 400);
            }

            // 改行で区切られたIPリストを配列に変換
            const ipList = ips.split(/\r?\n/).map((ip: string) => ip.trim()).filter((ip: string) => ip);

            if (ipList.length === 0) {
                return respondWithError(c, 'No valid IPs provided', 3005, 400);
            }

            const result = await ipAccessControlService.replaceWhitelist(ipList);

            await notifyIpListReplaced("whitelist", result.count);
            return c.json({
                success: true,
                message: `Whitelist replaced with ${result.count} IPs`,
                added: result.added
            });
        } catch (error) {
            Log.error('Error replacing whitelist:', error);
            return respondWithError(c, 'Internal server error', 9999, 500);
        }
    }

    /**
     * アクセス制御設定を取得
     */
    static async getAccessSettings(c: Context) {
        try {
            const settings = await ipAccessControlService.getAccessSettings();
            return c.json(settings);
        } catch (error) {
            Log.error('Error getting access settings:', error);
            return respondWithError(c, 'Internal server error', 9999, 500);
        }
    }

    /**
     * アクセス制御設定を更新
     */
    static async updateAccessSettings(c: Context) {
        try {
            const data = await c.req.json();
            const { blacklistEnabled, whitelistEnabled } = data;

            if (blacklistEnabled === undefined || whitelistEnabled === undefined) {
                return respondWithError(c, 'Both blacklistEnabled and whitelistEnabled settings are required', 3007, 400);
            }

            const settings: AccessSettings = {
                blacklistEnabled: !!blacklistEnabled,
                whitelistEnabled: !!whitelistEnabled
            };

            const updatedSettings = await ipAccessControlService.updateAccessSettings(settings);

            // 設定変更を通知
            await notifyAccessSettingsChange(settings);

            return c.json({
                success: true,
                settings: updatedSettings,
                message: 'Access settings updated successfully'
            });
        } catch (error) {
            Log.error('Error updating access settings:', error);
            return respondWithError(c, 'Internal server error', 9999, 500);
        }
    }
}

/**
 * 設定変更を通知
 */
async function notifyAccessSettingsChange(settings: AccessSettings): Promise<void> {
    const message = `
🔒 **アクセス制御設定変更**
**ブラックリスト:** ${settings.blacklistEnabled ? '有効' : '無効'}
**ホワイトリスト:** ${settings.whitelistEnabled ? '有効' : '無効'}
**モード説明:** ${getAccessModeDescription(settings)}
        `.trim();

    await discordNotifyService.sendMessage(message);
}

/**
 * 現在のモード説明を取得
 */
function getAccessModeDescription(settings: AccessSettings): string {
    if (settings.blacklistEnabled && settings.whitelistEnabled) {
        return "ホワイトリストに登録されたIPのみアクセス可能、ブラックリストに登録されたIPはアクセス不可（ホワイトリスト優先）";
    } else if (settings.whitelistEnabled) {
        return "ホワイトリストに登録されたIPのみアクセス可能";
    } else if (settings.blacklistEnabled) {
        return "ブラックリストに登録されたIP以外はアクセス可能";
    } else {
        return "アクセス制限なし（全てのIPがアクセス可能）";
    }
}

/**
 * IPリスト置換を通知
 */
async function notifyIpListReplaced(type: string, count: number): Promise<void> {
    const message = `
🔒 **IPリスト置換**
**リスト種別:** ${type === "blacklist" ? "ブラックリスト" : "ホワイトリスト"}
**登録件数:** ${count}件
**操作:** 既存リスト削除後に新規登録
        `.trim();

    await discordNotifyService.sendMessage(message);
}