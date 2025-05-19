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