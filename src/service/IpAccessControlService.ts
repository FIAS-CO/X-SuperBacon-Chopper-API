// src/service/IpAccessControlService.ts
import prisma from "../db";
import { Log } from "../util/Log";
import { discordNotifyService } from "./DiscordNotifyService";

export type IpAccessType = "blacklist" | "whitelist";
export type AccessSettings = {
    blacklistEnabled: boolean;
    whitelistEnabled: boolean;
};

export class IpAccessControlService {
    /**
     * IPアドレスがブラックリストに登録されているか確認
     */
    async isBlacklisted(ip: string): Promise<boolean> {
        try {
            const entry = await prisma.ipAccessControl.findFirst({
                where: {
                    ip: ip,
                    type: "blacklist"
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
                    type: "whitelist"
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
    async replaceBlacklist(ips: string[]): Promise<{
        count: number;
        added: string[];
        invalid: string[];
    }> {
        const added: string[] = [];
        const invalid: string[] = [];

        try {
            // トランザクション内で処理
            await prisma.$transaction(async (prisma) => {
                // 現在のブラックリストを全て削除
                await prisma.ipAccessControl.deleteMany({
                    where: { type: "blacklist" }
                });

                // 有効なIPのみフィルタリング
                const validIps = ips.filter(ip => {
                    const isValid = isValidIpAddress(ip);
                    if (!isValid) invalid.push(ip);
                    return isValid;
                });

                // 新しいブラックリストを一括で追加
                if (validIps.length > 0) {
                    await prisma.ipAccessControl.createMany({
                        data: validIps.map(ip => ({
                            ip,
                            type: "blacklist"
                        }))
                    });
                    added.push(...validIps);
                }
            });

            Log.info(`Blacklist replaced with ${added.length} IPs`);

            return {
                count: added.length,
                added,
                invalid
            };
        } catch (error) {
            Log.error("Error replacing blacklist:", error);
            throw error;
        }
    }

    /**
     * ホワイトリストを完全に置き換える
     */
    async replaceWhitelist(ips: string[]): Promise<{
        count: number;
        added: string[];
        invalid: string[];
    }> {
        const added: string[] = [];
        const invalid: string[] = [];

        try {
            // トランザクション内で処理
            await prisma.$transaction(async (prisma) => {
                // 現在のホワイトリストを全て削除
                await prisma.ipAccessControl.deleteMany({
                    where: { type: "whitelist" }
                });

                // 有効なIPのみフィルタリング
                const validIps = ips.filter(ip => {
                    const isValid = isValidIpAddress(ip);
                    if (!isValid) invalid.push(ip);
                    return isValid;
                });

                // 新しいホワイトリストを一括で追加
                if (validIps.length > 0) {
                    await prisma.ipAccessControl.createMany({
                        data: validIps.map(ip => ({
                            ip,
                            type: "whitelist"
                        }))
                    });
                    added.push(...validIps);
                }
            });

            Log.info(`Whitelist replaced with ${added.length} IPs`);

            return {
                count: added.length,
                added,
                invalid
            };
        } catch (error) {
            Log.error("Error replacing whitelist:", error);
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

// IP形式の検証ヘルパー関数
function isValidIpAddress(ip: string): boolean {
    // IPv4アドレスのバリデーション
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Pattern);

    if (!match) return false;

    // 各オクテットが0～255の範囲内かチェック
    for (let i = 1; i <= 4; i++) {
        const octet = parseInt(match[i]);
        if (octet < 0 || octet > 255) return false;
    }

    return true;
}

// サービスのインスタンスをエクスポート
export const ipAccessControlService = new IpAccessControlService();