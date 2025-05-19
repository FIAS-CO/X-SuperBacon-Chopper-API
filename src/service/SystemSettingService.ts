import prisma from "../db";
import { AccessSettings } from "../types/Types";
import { Log } from "../util/Log";

const ACCESS_SETTING_KEYS = {
    BLACKLIST: 'blacklist_enabled',
    WHITELIST: 'whitelist_enabled'
} as const;

export class SystemSettingService {

    /** メモリキャッシュ */
    private accessSettingCache: AccessSettings | null = null;
    /** 取得中の Promise（同時呼び出しを束ねる） */
    private accessSettingLoadPromise: Promise<AccessSettings> | null = null;
    private aegisEnabledCache: boolean = false;
    private aegisEnabledLoadPromise: Promise<boolean> | null = null;

    /**
     * システム設定を取得
     */
    async getAllSettings(): Promise<{ [key: string]: string }> {
        try {
            const settings = await prisma.systemSetting.findMany();
            const result: { [key: string]: string } = {};
            settings.forEach(setting => {
                result[setting.key] = setting.value;
            });
            return result;
        } catch (error) {
            Log.error("Error getting all settings:", error);
            throw error;
        }
    }

    /**
     * Public getter（必要なら lazy load）
     */
    async getAccessSettings(): Promise<AccessSettings> {
        if (this.accessSettingCache) return this.accessSettingCache;
        if (this.accessSettingLoadPromise) return this.accessSettingLoadPromise;

        // 初回アクセス：DB から取得
        this.accessSettingLoadPromise = this.fetchFromDB()
            .then(settings => {
                this.accessSettingCache = settings;
                return settings;
            })
            .finally(() => {
                this.accessSettingLoadPromise = null;
            });

        return this.accessSettingLoadPromise;
    }

    /**
     * アクセス制御設定を取得
     */
    async fetchFromDB(): Promise<AccessSettings> {
        try {
            const settings = await prisma.systemSetting.findMany({
                where: {
                    key: {
                        in: [ACCESS_SETTING_KEYS.BLACKLIST, ACCESS_SETTING_KEYS.WHITELIST]
                    }
                }
            });

            const blacklistSetting = settings.find(s => s.key === ACCESS_SETTING_KEYS.BLACKLIST);
            const whitelistSetting = settings.find(s => s.key === ACCESS_SETTING_KEYS.WHITELIST);

            return {
                blacklistEnabled: blacklistSetting ? blacklistSetting.value === 'true' : true,
                whitelistEnabled: whitelistSetting ? whitelistSetting.value === 'true' : false
            };
        } catch (error) {
            Log.error("Error getting access settings:", error);
            // エラー時はデフォルト設定を返す（セキュリティ重視）
            return {
                blacklistEnabled: true,
                whitelistEnabled: false
            };
        }
    }

    /**
     * ブラックリストを有効にする
     * @returns 
     */
    async enableBlacklist(): Promise<AccessSettings> {
        const settings = await this.getAccessSettings();
        settings.blacklistEnabled = true;

        const updatedSettings = await this.updateAccessSettings(settings);

        return updatedSettings;
    }

    /**
     * ブラックリストを無効にする
     * @returns 
     */
    async disableBlacklist(): Promise<AccessSettings> {
        const settings = await this.getAccessSettings();
        settings.blacklistEnabled = false;

        const updatedSettings = await this.updateAccessSettings(settings);

        return updatedSettings;
    }

    /**
     * ホワイトリストを有効にする
     * @returns 
     */
    async enableWhitelist(): Promise<AccessSettings> {
        const settings = await this.getAccessSettings();
        settings.whitelistEnabled = true;

        const updatedSettings = await this.updateAccessSettings(settings);

        return updatedSettings;
    }

    /**
     * ホワイトリストを無効にする
     * @returns 
     */
    async disableWhitelist(): Promise<AccessSettings> {
        const settings = await this.getAccessSettings();
        settings.whitelistEnabled = false;

        const updatedSettings = await this.updateAccessSettings(settings);

        return updatedSettings;
    }

    /**
     * ブラックリストとホワイトリストを有効にする
     * @returns
     */
    async enableBlackAndWithitelist(): Promise<AccessSettings> {
        const settings: AccessSettings = {
            blacklistEnabled: true,
            whitelistEnabled: true
        };
        return await this.updateAccessSettings(settings);
    }

    /**
     * アクセス制御設定を更新
     */
    async updateAccessSettings(settings: AccessSettings): Promise<AccessSettings> {
        try {
            await prisma.$transaction([
                prisma.systemSetting.upsert({
                    where: { key: ACCESS_SETTING_KEYS.BLACKLIST },
                    update: {
                        value: settings.blacklistEnabled ? 'true' : 'false',
                        updatedAt: new Date()
                    },
                    create: {
                        key: ACCESS_SETTING_KEYS.BLACKLIST,
                        value: settings.blacklistEnabled ? 'true' : 'false',
                        updatedAt: new Date()
                    }
                }),
                prisma.systemSetting.upsert({
                    where: { key: ACCESS_SETTING_KEYS.WHITELIST },
                    update: {
                        value: settings.whitelistEnabled ? 'true' : 'false',
                        updatedAt: new Date()
                    },
                    create: {
                        key: ACCESS_SETTING_KEYS.WHITELIST,
                        value: settings.whitelistEnabled ? 'true' : 'false',
                        updatedAt: new Date()
                    }
                })
            ]);

            this.accessSettingCache = settings;
            return settings;
        } catch (error) {
            Log.error("Error updating access settings:", error);
            throw error;
        }
    }

    /**
     * Aegis の有効/無効を取得
     */
    async getAegisEnabled(): Promise<boolean> {
        if (this.aegisEnabledCache) return this.aegisEnabledCache;
        if (this.aegisEnabledLoadPromise) return this.aegisEnabledLoadPromise;

        // 初回アクセス：DB から取得
        this.aegisEnabledLoadPromise = prisma.systemSetting.findUnique({
            where: { key: 'aegis_enabled' }
        })
            .then(setting => {
                this.aegisEnabledCache = setting ? setting.value === 'true' : false;
                return this.aegisEnabledCache;
            })
            .finally(() => {
                this.aegisEnabledLoadPromise = null;
            });
        return this.aegisEnabledLoadPromise;
    }

    /**
     * Aegis の有効/無効を更新
     */
    async updateAegisEnabled(enabled: boolean): Promise<boolean> {
        try {
            await prisma.systemSetting.upsert({
                where: { key: 'aegis_enabled' },
                update: {
                    value: enabled ? 'true' : 'false',
                    updatedAt: new Date()
                },
                create: {
                    key: 'aegis_enabled',
                    value: enabled ? 'true' : 'false',
                    updatedAt: new Date()
                }
            });
            this.aegisEnabledCache = enabled;
            return enabled;
        } catch (error) {
            Log.error("Error updating aegis enabled:", error);
            throw error;
        }
    }
}

export const systemSettingService = new SystemSettingService();