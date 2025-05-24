import { Context } from 'hono';
import { apiAccessLogService } from '../service/ApiAccessLogService';
import { Log } from '../util/Log';
import { respondWithDetailedError } from '../util/Response';

export class ApiAccessLogController {
    /**
     * アクセスログ一覧を取得
     */
    static async getLogs(c: Context) {
        try {
            const query = c.req.query();

            const logs = await apiAccessLogService.getLogs({
                limit: query.limit ? parseInt(query.limit) : 100,
                offset: query.offset ? parseInt(query.offset) : 0,
                endpoint: query.endpoint,
                method: query.method,
                statusMin: query.statusMin ? parseInt(query.statusMin) : undefined,
                statusMax: query.statusMax ? parseInt(query.statusMax) : undefined,
                orderBy: query.orderBy as 'timestamp' | 'responseTime' | undefined,
                orderDirection: query.orderDirection as 'asc' | 'desc' | undefined
            });

            return c.json({
                success: true,
                count: logs.length,
                data: logs
            });
        } catch (error) {
            Log.error('Error retrieving access logs:', error);
            return respondWithDetailedError(c, error as Error, 9999, 500);
        }
    }
}
