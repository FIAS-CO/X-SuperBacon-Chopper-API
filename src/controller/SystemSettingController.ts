import { Context } from "vm";
import { discordNotifyService } from "../service/DiscordNotifyService";
import { AccessSettings, systemSettingService } from "../service/SystemSettingService";
import { Log } from "../util/Log";
import { respondWithError } from "../util/Response";
import { ErrorCodes } from "../errors/ErrorCodes";

export class SystemSettingController {

    /**
     * アクセス制御設定を取得
     */
    static async getAccessSettings(c: Context) {
        try {
            const settings = await systemSettingService.getAccessSettings();
            return c.json(settings);
        } catch (error) {
            Log.error('Error getting access settings:', error);
            return respondWithError(c, 'Internal server error', ErrorCodes.FAILED_TO_GET_ACCESS_SETTINGS, 500);
        }
    }

    /**
     * ブラックリストを有効にする
     */
    static async enableBlacklist(c: Context) {
        try {
            const settings = await systemSettingService.getAccessSettings();
            settings.blacklistEnabled = true;

            const updatedSettings = await systemSettingService.updateAccessSettings(settings);

            await notifyAccessSettingsChange(settings);

            return c.json({
                success: true,
                settings: updatedSettings,
                message: 'Blacklist enabled successfully'
            });
        } catch (error) {
            Log.error('Error enabling blacklist:', error);
            return respondWithError(c, 'Internal server error', ErrorCodes.FAILED_TO_UPDATE_ACCESS_SETTINGS, 500);
        }
    }

    /**
     * ブラックリストを無効にする
     */
    static async disableBlacklist(c: Context) {
        try {
            const settings = await systemSettingService.getAccessSettings();
            settings.blacklistEnabled = false;

            const updatedSettings = await systemSettingService.updateAccessSettings(settings);

            await notifyAccessSettingsChange(settings);

            return c.json({
                success: true,
                settings: updatedSettings,
                message: 'Blacklist disabled successfully'
            });
        } catch (error) {
            Log.error('Error disabling blacklist:', error);
            return respondWithError(c, 'Internal server error', ErrorCodes.FAILED_TO_UPDATE_ACCESS_SETTINGS, 500);
        }
    }

    /**
     * ホワイトリストを有効にする
     */
    static async enableWhitelist(c: Context) {
        try {
            const settings = await systemSettingService.getAccessSettings();
            settings.whitelistEnabled = true;

            const updatedSettings = await systemSettingService.updateAccessSettings(settings);

            await notifyAccessSettingsChange(settings);

            return c.json({
                success: true,
                settings: updatedSettings,
                message: 'Whitelist enabled successfully'
            });
        } catch (error) {
            Log.error('Error enabling whitelist:', error);
            return respondWithError(c, 'Internal server error', ErrorCodes.FAILED_TO_UPDATE_ACCESS_SETTINGS, 500);
        }
    }

    /**
     * ホワイトリストを無効にする
     */
    static async disableWhitelist(c: Context) {
        try {
            const settings = await systemSettingService.getAccessSettings();
            settings.whitelistEnabled = false;

            const updatedSettings = await systemSettingService.updateAccessSettings(settings);

            await notifyAccessSettingsChange(settings);

            return c.json({
                success: true,
                settings: updatedSettings,
                message: 'Whitelist disabled successfully'
            });
        } catch (error) {
            Log.error('Error disabling whitelist:', error);
            return respondWithError(c, 'Internal server error', ErrorCodes.FAILED_TO_UPDATE_ACCESS_SETTINGS, 500);
        }
    }
}

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
        return "ブラックリストに登録されておらず、ホワイトリストに登録されたIPのみアクセス可能(ブラックリスト優先)";
    } else if (settings.whitelistEnabled) {
        return "ホワイトリストに登録されたIPのみアクセス可能";
    } else if (settings.blacklistEnabled) {
        return "ブラックリストに登録されたIP以外はアクセス可能";
    } else {
        return "アクセス制限なし（全てのIPがアクセス可能）";
    }
}

