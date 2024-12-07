import { PrismaClient } from '@prisma/client';
import { CHECK_STATUS, CheckStatus } from '../types/Types';

const prisma = new PrismaClient();

interface CheckResult {
    url: string,
    checkStatus: CheckStatus
}

export class CheckHistoryService {
    async getHistoryById(sessionId: string): Promise<CheckResult[] | null> {
        try {
            const checkResults = await prisma.twitterCheck.findMany({ where: { sessionId: sessionId } });

            if (checkResults.length === 0) {
                console.log(`no data found by sessionID ${sessionId}`)
                return [];
            }

            const isCheckStatus = (value: any): value is CheckStatus => {
                return CHECK_STATUS.includes(value as CheckStatus);
            };

            const checkResultsData: CheckResult[] = checkResults.map(record => ({
                url: record.url,
                checkStatus: isCheckStatus(record.result) ? record.result : 'UNKNOWN'
            }));

            console.log(checkResultsData)
            return checkResultsData
        } catch (error) {
            console.error(`Error to get check history of sessionID ${sessionId}:`, error);
            throw error;
        }
    }
}