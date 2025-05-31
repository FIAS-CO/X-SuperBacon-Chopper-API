import prisma from "../db";
import { IP_ACCESS_TYPE, IpAccessType } from "../types/Types";
import { Log } from "../util/Log";

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
     * ブラックリストを削除
     */
    async deleteBlacklist(): Promise<{
        count: number;
    }> {
        return this.deleteList(IP_ACCESS_TYPE.BLACKLIST);
    }

    /**
     * ホワイトリストを削除
     */
    async deleteWhitelist(): Promise<{
        count: number;
    }> {
        return this.deleteList(IP_ACCESS_TYPE.WHITELIST);
    }

    private async deleteList(type: IpAccessType): Promise<{
        count: number;
    }> {
        try {
            const result = await prisma.ipAccessControl.deleteMany({
                where: { type }
            });

            Log.info(`${type} deleted, count: ${result.count}`);

            return {
                count: result.count
            };
        } catch (error) {
            Log.error(`Error deleting ${type}:`, error);
            throw error;
        }
    }

    /**
     * ブラックリストにIPを追加
     */
    async addBlacklist(ips: string[]): Promise<{
        count: number;
        added: string[];
    }> {
        return this.addList(IP_ACCESS_TYPE.BLACKLIST, ips);
    }

    /**
     * ホワイトリストにIPを追加
     */
    async addWhitelist(ips: string[]): Promise<{
        count: number;
        added: string[];
    }> {
        return this.addList(IP_ACCESS_TYPE.WHITELIST, ips);
    }

    private async addList(type: IpAccessType, ips: string[]): Promise<{
        count: number;
        added: string[];
    }> {
        const added: string[] = [];

        try {
            await prisma.$transaction(async (prisma) => {
                const existingEntries = await prisma.ipAccessControl.findMany({
                    where: {
                        ip: { in: ips },
                        type
                    },
                    select: { ip: true }
                });

                const existingIps = new Set(existingEntries.map(entry => entry.ip));
                const newIps = ips.filter(ip => !existingIps.has(ip));

                if (newIps.length > 0) {
                    await prisma.ipAccessControl.createMany({
                        data: newIps.map(ip => ({
                            ip,
                            type
                        }))
                    });
                    added.push(...newIps);
                }
            });

            Log.info(`${type} added ${added.length} IPs`);

            return {
                count: added.length,
                added
            };
        } catch (error) {
            Log.error(`Error adding to ${type}:`, error);
            throw error;
        }
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