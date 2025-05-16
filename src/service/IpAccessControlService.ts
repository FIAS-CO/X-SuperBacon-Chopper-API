import prisma from "../db";
import { Log } from "../util/Log";

export const IP_ACCESS_TYPE = {
    BLACKLIST: "blacklist",
    WHITELIST: "whitelist",
} as const;

export type IpAccessType = typeof IP_ACCESS_TYPE[keyof typeof IP_ACCESS_TYPE];

export class IpAccessControlService {
    /**
     * IPアドレスがブラックリストに登録されているか確認
     */
    async isBlacklisted(ip: string): Promise<boolean> {
        try {
            const entry = await prisma.ipAccessControl.findFirst({
                where: {
                    ip: ip,
                    type: IP_ACCESS_TYPE.BLACKLIST,
                }
            });
            return !!entry;
        } catch (error) {
            Log.error(`Error checking if IP ${ip} is blacklisted:`, error);
            return false; // エラー時はアクセスを許可する（フォールバック）
        }
    }

    /**
     * IPアドレスがホワイトリストに登録されているか確認
     */
    async isWhitelisted(ip: string): Promise<boolean> {
        try {
            const entry = await prisma.ipAccessControl.findFirst({
                where: {
                    ip: ip,
                    type: IP_ACCESS_TYPE.WHITELIST,
                }
            });
            return !!entry;
        } catch (error) {
            Log.error(`Error checking if IP ${ip} is whitelisted:`, error);
            return false; // エラー時はホワイトリストに登録されていないと扱う
        }
    }

    /**
     * アクセス制御設定を取得
     */
    async getAccessSettings(): Promise<AccessSettings> {
        try {
            const settings = await prisma.systemSetting.findMany({
                where: {
                    key: {
                        in: ['blacklist_enabled', 'whitelist_enabled']
                    }
                }
            });

            // 設定値の取得（デフォルト: ブラックリストのみ有効）
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
            // トランザクション内で両方の設定を更新
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

            return settings;
        } catch (error) {
            Log.error("Error updating access settings:", error);
            throw error;
        }
    }

    /**
     * アクセス許可を判定
     */
    async isAllowed(ip: string): Promise<boolean> {
        const settings = await this.getAccessSettings();

        // ホワイトリストが有効で、IPがホワイトリストに登録されている場合は許可
        if (settings.whitelistEnabled && await this.isWhitelisted(ip)) {
            return true;
        }

        // ブラックリストが有効で、IPがブラックリストに登録されている場合は拒否
        if (settings.blacklistEnabled && await this.isBlacklisted(ip)) {
            return false;
        }

        // ホワイトリストのみが有効で、IPがホワイトリストにない場合は拒否
        if (settings.whitelistEnabled && !settings.blacklistEnabled) {
            return false;
        }

        // それ以外の場合は許可
        return true;
    }

    /**
     * ブラックリストを完全に置き換える
     */
    async replaceBlacklist(ips: string[]) {
        return this.replaceList(IP_ACCESS_TYPE.BLACKLIST, ips);
    }

    /**
     * ホワイトリストを完全に置き換える
     */
    async replaceWhitelist(ips: string[]) {
        return this.replaceList(IP_ACCESS_TYPE.WHITELIST, ips);
    }

    private async replaceList(type: IpAccessType, ips: string[]): Promise<{
        count: number;
        added: string[];
    }> {
        const added: string[] = [];

        try {
            await prisma.$transaction(async (prisma) => {
                await prisma.ipAccessControl.deleteMany({
                    where: { type }
                });

                if (ips.length > 0) {
                    await prisma.ipAccessControl.createMany({
                        data: ips.map(ip => ({
                            ip,
                            type
                        }))
                    });
                    added.push(...ips);
                }
            });

            Log.info(`${type} replaced with ${added.length} IPs`);

            return {
                count: added.length,
                added
            };
        } catch (error) {
            Log.error(`Error replacing ${type}:`, error);
            throw error;
        }
    }

    /**
     * リストを取得
     */
    async getList(type?: IpAccessType): Promise<any[]> {
        try {
            const whereClause = type ? { type } : {};

            return await prisma.ipAccessControl.findMany({
                select: {
                    id: true,
                    ip: true,
                },
                where: whereClause,
                orderBy: {
                    createdAt: 'desc'
                }
            });
        } catch (error) {
            Log.error(`Error getting IP list:`, error);
            throw error;
        }
    }
}

// サービスのインスタンスをエクスポート
export const ipAccessControlService = new IpAccessControlService();