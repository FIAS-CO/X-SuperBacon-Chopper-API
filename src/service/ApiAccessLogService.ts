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
    checkSearchBan?: boolean;
    checkRepost?: boolean;
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
                    checkSearchBan: data.checkSearchBan ?? null,
                    checkRepost: data.checkRepost ?? null,
                    errorCode: data.errorCode || null,
                    isBlocked: data.isBlocked || false,
                    blockReason: data.blockReason || null
                }
            });
        } catch (error) {
            Log.error('Failed to log API access:', error);
        }
    }

    /**
     * APIアクセスログ一覧を取得（条件・ソート・制限付き）
     */
    async getLogs(params?: {
        limit?: number;
        offset?: number;
        endpoint?: string;
        method?: string;
        statusMin?: number;
        statusMax?: number;
        orderBy?: 'timestamp' | 'responseTime';
        orderDirection?: 'asc' | 'desc';
    }): Promise<any[]> {
        const {
            limit = 500,
            offset = 0,
            endpoint,
            method,
            statusMin,
            statusMax,
            orderBy = 'timestamp',
            orderDirection = 'desc'
        } = params || {};

        const where: any = {};
        if (endpoint) where.endpoint = endpoint;
        if (method) where.method = method;
        if (statusMin !== undefined || statusMax !== undefined) {
            where.responseStatus = {};
            if (statusMin !== undefined) where.responseStatus.gte = statusMin;
            if (statusMax !== undefined) where.responseStatus.lte = statusMax;
        }

        return await prisma.apiAccessLog.findMany({
            where,
            orderBy: {
                [orderBy]: orderDirection,
            },
            take: limit,
            skip: offset
        });
    }
}

export const apiAccessLogService = new ApiAccessLogService();