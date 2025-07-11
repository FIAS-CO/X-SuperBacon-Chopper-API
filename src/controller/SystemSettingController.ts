import { Context } from "vm";
import { systemSettingService } from "../service/SystemSettingService";
import { Log } from "../util/Log";
import { respondWithDetailedError } from "../util/Response";
import { ErrorCodes } from "../errors/ErrorCodes";
import { SystemSettingsUtil } from "../util/SystemSettingsUtil";

export class SystemSettingController {
    /**
     * システム設定を取得
     */
    static async getSystemSettings(c: Context) {
        try {
            const settings = await systemSettingService.getAllSettings();
            return c.json(settings);
        } catch (error) {
            Log.error('Error getting system settings:', error);
            return respondWithDetailedError(c, error as Error, ErrorCodes.FAILED_TO_GET_SYSTEM_SETTINGS, 500);
        }
    }

    /**
     * ブラックリストを有効にする
     */
    static async enableBlacklist(c: Context) {
        try {
            const updatedSettings = await systemSettingService.enableBlacklist();

            await SystemSettingsUtil.notifyAccessSettingsChange(updatedSettings);

            return c.json({
                success: true,
                settings: updatedSettings,
                message: 'Blacklist enabled successfully'
            });
        } catch (error) {
            Log.error('Error enabling blacklist:', error);
            return respondWithDetailedError(c, error as Error, ErrorCodes.FAILED_TO_UPDATE_SYSTEM_SETTINGS, 500);
        }
    }

    /**
     * ブラックリストを無効にする
     */
    static async disableBlacklist(c: Context) {
        try {
            const updatedSettings = await systemSettingService.disableBlacklist();

            await SystemSettingsUtil.notifyAccessSettingsChange(updatedSettings);

            return c.json({
                success: true,
                settings: updatedSettings,
                message: 'Blacklist disabled successfully'
            });
        } catch (error) {
            Log.error('Error disabling blacklist:', error);
            return respondWithDetailedError(c, error as Error, ErrorCodes.FAILED_TO_UPDATE_SYSTEM_SETTINGS, 500);
        }
    }

    /**
     * ホワイトリストを有効にする
     */
    static async enableWhitelist(c: Context) {
        try {
            const updatedSettings = await systemSettingService.enableWhitelist();

            await SystemSettingsUtil.notifyAccessSettingsChange(updatedSettings);

            return c.json({
                success: true,
                settings: updatedSettings,
                message: 'Whitelist enabled successfully'
            });
        } catch (error) {
            Log.error('Error enabling whitelist:', error);
            return respondWithDetailedError(c, error as Error, ErrorCodes.FAILED_TO_UPDATE_SYSTEM_SETTINGS, 500);
        }
    }

    /**
     * ホワイトリストを無効にする
     */
    static async disableWhitelist(c: Context) {
        try {
            const updatedSettings = await systemSettingService.disableWhitelist();

            await SystemSettingsUtil.notifyAccessSettingsChange(updatedSettings);

            return c.json({
                success: true,
                settings: updatedSettings,
                message: 'Whitelist disabled successfully'
            });
        } catch (error) {
            Log.error('Error disabling whitelist:', error);
            return respondWithDetailedError(c, error as Error, ErrorCodes.FAILED_TO_UPDATE_SYSTEM_SETTINGS, 500);
        }
    }

    /**
     * Aegisを有効にする
     */
    static async enableAegis(c: Context) {
        try {
            await systemSettingService.updateAegisEnabled(true);

            await SystemSettingsUtil.notifyAegisStatusChange(true);
            return c.json({
                success: true,
                message: 'Aegis enabled successfully'
            });
        } catch (error) {
            Log.error('Error enabling aegis:', error);
            return respondWithDetailedError(c, error as Error, ErrorCodes.FAILED_TO_UPDATE_SYSTEM_SETTINGS, 500);
        }
    }

    /**
     * Aegisを無効にする
     */
    static async disableAegis(c: Context) {
        try {
            await systemSettingService.updateAegisEnabled(false);

            await SystemSettingsUtil.notifyAegisStatusChange(false);
            return c.json({
                success: true,
                message: 'Aegis disabled successfully'
            });
        } catch (error) {
            Log.error('Error disabling aegis:', error);
            return respondWithDetailedError(c, error as Error, ErrorCodes.FAILED_TO_UPDATE_SYSTEM_SETTINGS, 500);
        }
    }
}

