import { PrismaClient } from '@prisma/client';
import { ShadowBanCheckResult } from '../types/ShadowBanCheckResult';
import { Log } from '../util/Log';

const prisma = new PrismaClient();

export class ShadowbanHistoryService {
    async createHistory(screenName: string, checkResult: ShadowBanCheckResult, sessionId: string, ip: string): Promise<any> {
        try {
            const result = await prisma.shadowBanCheck.create({
                data: {
                    screen_name: screenName,
                    not_found: checkResult.not_found,
                    suspend: checkResult.suspend,
                    protect: checkResult.protect,
                    search_ban: checkResult.search_ban,
                    search_suggestion_ban: checkResult.search_suggestion_ban,
                    ghost_ban: checkResult.ghost_ban,
                    reply_deboosting: checkResult.reply_deboosting,
                    sessionId: sessionId,
                    ip: ip,
                    // dateはデフォルト値が設定されるので指定不要
                }
            });

            return result;
        } catch (error) {
            Log.error(`Error creating shadowban history for user ${screenName}:`, error);
            throw error;
        }
    }

    async getHistory(limitParam: string): Promise<any[]> {
        const limit = (limitParam === 'all') ? undefined : (limitParam ? parseInt(limitParam) : 100);
        const history = await prisma.shadowBanCheck.findMany({
            take: limit,
            orderBy: {
                id: 'desc',
            }
        })

        function toJST(date: Date) {
            return date.toLocaleString('ja-JP', {
                timeZone: 'Asia/Tokyo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }) + ' JST'
        }

        // UTCから日本時間に変換
        const historyWithJST = history.map(({ ...record }) => {
            const date = toJST(new Date(record.date))
            return {
                ...record,
                date: date,
            }
        })

        return historyWithJST;
    }

    async getHistoryById(sessionId: string): Promise<any> {
        try {
            const checkResults = await prisma.shadowBanCheck.findFirst({
                where: { sessionId: sessionId }
            });

            if (!checkResults) {
                Log.info(`No shadowban check data found for sessionId ${sessionId}`);
                return null;
            }

            return checkResults;
        } catch (error) {
            Log.error(`Error getting shadowban history for sessionId ${sessionId}:`, error);
            throw error;
        }
    }
}