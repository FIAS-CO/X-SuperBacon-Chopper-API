import prisma from "../db";
import { Log } from "../util/Log";

export type AccessSettings = {
    blacklistEnabled: boolean;
    whitelistEnabled: boolean;
};
const ACCESS_SETTING_KEYS = {
    BLACKLIST: 'blacklist_enabled',
    WHITELIST: 'whitelist_enabled'
} as const;

export class SystemSettingService {

    /** メモリキャッシュ */
    private cache: AccessSettings | null = null;
    /** 取得中の Promise（同時呼び出しを束ねる） */
    private loadPromise: Promise<AccessSettings> | null = null;

    /**
     * Public getter（必要なら lazy load）
     */
    async getAccessSettings(): Promise<AccessSettings> {
        if (this.cache) return this.cache;
        if (this.loadPromise) return this.loadPromise;

        // 初回アクセス：DB から取得
        this.loadPromise = this.fetchFromDB()
            .then(settings => {
                this.cache = settings;
                return settings;
            })
            .finally(() => {
                this.loadPromise = null;
            });

        return this.loadPromise;
    }

    /**
     * アクセス制御設定を取得
     */
    async fetchFromDB(): Promise<AccessSettings> {
        try {
            const settings = await prisma.systemSetting.findMany({
                where: {
                    key: {
                        in: ['blacklist_enabled', 'whitelist_enabled']
                    }
                }
            });

            const blacklistSetting = settings.find(s => s.key === 'blacklist_enabled');
            const whitelistSetting = settings.find(s => s.key === 'whitelist_enabled');

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
     * アクセス制御設定を更新
     */
    async updateAccessSettings(settings: AccessSettings): Promise<AccessSettings> {
        try {
            await prisma.$transaction([
                prisma.systemSetting.upsert({
                    where: { key: 'blacklist_enabled' },
                    update: {
                        value: settings.blacklistEnabled ? 'true' : 'false',
                        updatedAt: new Date()
                    },
                    create: {
                        key: 'blacklist_enabled',
                        value: settings.blacklistEnabled ? 'true' : 'false',
                        updatedAt: new Date()
                    }
                }),
                prisma.systemSetting.upsert({
                    where: { key: 'whitelist_enabled' },
                    update: {
                        value: settings.whitelistEnabled ? 'true' : 'false',
                        updatedAt: new Date()
                    },
                    create: {
                        key: 'whitelist_enabled',
                        value: settings.whitelistEnabled ? 'true' : 'false',
                        updatedAt: new Date()
                    }
                })
            ]);

            this.cache = settings;
            return settings;
        } catch (error) {
            Log.error("Error updating access settings:", error);
            throw error;
        }
    }
}

export const systemSettingService = new SystemSettingService();