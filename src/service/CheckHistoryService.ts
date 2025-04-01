import { PrismaClient } from '@prisma/client';
import { CHECK_STATUS, CheckStatus } from '../types/Types';
import { Log } from '../util/Log';

const prisma = new PrismaClient();

interface CheckResult {
    url: string,
    checkStatus: CheckStatus
}

export class CheckHistoryService {
    async getHistoryById(sessionId: string): Promise<{ results: CheckResult[]; timestamp: string; }> {
        try {
            const checkResults = await prisma.twitterCheck.findMany({ where: { sessionId: sessionId } });

            if (checkResults.length === 0) {
                return { results: [], timestamp: '' };
            }

            const isCheckStatus = (value: any): value is CheckStatus => {
                return CHECK_STATUS.includes(value as CheckStatus);
            };

            const checkResultsData: CheckResult[] = checkResults.map(record => ({
                url: record.url,
                checkStatus: isCheckStatus(record.result) ? record.result : 'UNKNOWN'
            }));

            // セッション内の最初のチェック時刻を取得
            const timestamp = checkResults[0].date.toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            return {
                results: checkResultsData,
                timestamp
            };
        } catch (error) {
            Log.error(`Error to get check history of sessionID ${sessionId}:`, error);
            throw error;
        }
    }

    async createCheckHistory(
        username: string,
        url: string,
        result: string,
        ip: string,
        sessionId: string,
        tweetDate: string,
        withShadowBanCheck: boolean = false
    ): Promise<any> {
        return await prisma.twitterCheck.create({
            data: {
                username: username,
                url: url,
                result: result,
                ip: ip,
                sessionId: sessionId,
                tweetDate: new Date(tweetDate),
                withShadowBanCheck: withShadowBanCheck
            }
        })
    }
}