import { PrismaClient } from '@prisma/client';
import { ShadowBanCheckResult } from '..';

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
            console.error(`Error creating shadowban history for user ${screenName}:`, error);
            throw error;
        }
    }

    async getHistoryById(sessionId: string): Promise<any> {
        try {
            const checkResults = await prisma.shadowBanCheck.findFirst({
                where: { sessionId: sessionId }
            });

            if (!checkResults) {
                console.log(`No shadowban check data found for sessionId ${sessionId}`);
                return null;
            }

            return checkResults;
        } catch (error) {
            console.error(`Error getting shadowban history for sessionId ${sessionId}:`, error);
            throw error;
        }
    }
}