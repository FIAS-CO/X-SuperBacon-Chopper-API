import prisma from "../db";
import { Log } from "../util/Log";

interface AccessLogData {
    endpoint: string;
    method: string;
    requestIp: string;
    connectionIp: string;
    userAgent?: string;
    referer?: string;
    responseStatus: number;
    responseTime: number;
    screenName?: string;
    errorCode?: number;
    isBlocked?: boolean;
    blockReason?: string;
}

export class ApiAccessLogService {
    /**
     * APIアクセスログを記録（非同期実行でパフォーマンス影響を最小化）
     */
    async logAccess(data: AccessLogData): Promise<void> {
        try {
            await prisma.apiAccessLog.create({
                data: {
                    endpoint: data.endpoint,
                    method: data.method,
                    requestIp: data.requestIp,
                    connectionIp: data.connectionIp,
                    userAgent: data.userAgent || null,
                    referer: data.referer || null,
                    responseStatus: data.responseStatus,
                    responseTime: data.responseTime,
                    screenName: data.screenName || null,
                    errorCode: data.errorCode || null,
                    isBlocked: data.isBlocked || false,
                    blockReason: data.blockReason || null
                }
            });
        } catch (error) {
            Log.error('Failed to log API access:', error);
        }
    }
}

export const apiAccessLogService = new ApiAccessLogService();