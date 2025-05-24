import { Context, Next } from 'hono';
import { apiAccessLogService } from '../service/ApiAccessLogService';
import { serverDecryption } from '../util/ServerDecryption';

export const accessLogger = async (c: Context, next: Next) => {
    const startTime = Date.now();

    // リクエスト情報の取得
    const method = c.req.method;
    const endpoint = c.req.path;
    const connectionIp = c.req.header('x-forwarded-for') ||
        c.req.raw.headers.get('x-forwarded-for') ||
        c.req.header('x-real-ip') ||
        c.env?.remoteAddress ||
        'unknown';

    const userAgent = c.req.header('user-agent') || 'unknown';

    let requestIp: string = 'unknown';
    let screenName: string = 'unknown';

    // POSTリクエストの場合、リクエストボディから情報を取得
    if (method === 'POST') {
        try {
            const body = await c.req.json();
            screenName = body.screen_name;
            requestIp = body.key ? serverDecryption.decrypt(body.key) : 'unknown';
        } catch (error) {
            // JSON解析エラーは無視（GETリクエストなど）
        }
    }

    let responseStatus = 200;
    let errorCode: number = 0;
    let isBlocked = false;
    let blockReason: string = 'No blocked';

    try {
        await next();

        responseStatus = c.res.status;

        // ミドルウェアが設定した詳細情報を取得
        const blockInfo = c.get('blockInfo');

        if (blockInfo) {
            // 詳細なブロック情報がある場合
            isBlocked = true;
            blockReason = blockInfo.reason;
            errorCode = blockInfo.errorCode;
        } else if (responseStatus !== 200) {
            // 200以外は何らかのブロック（詳細情報なし）
            isBlocked = true;
            blockReason = 'Unknown block (no detailed info)';

            // レスポンスからエラーコードだけ取得
            try {
                const responseText = await c.res.clone().text();
                const responseBody = JSON.parse(responseText);
                errorCode = responseBody.code || null;
            } catch (parseError) {
                errorCode = 0;
            }
        }
        // responseStatus === 200 かつ blockInfo なし → 正常処理

    } catch (error) {
        responseStatus = 500;
        isBlocked = true;
        blockReason = 'Middleware exception';
        errorCode = 0;
    }

    const responseTime = Date.now() - startTime;

    // ログ記録（非同期実行）
    Promise.resolve().then(() => {
        apiAccessLogService.logAccess({
            endpoint,
            method,
            requestIp,
            connectionIp,
            userAgent,
            responseStatus,
            responseTime,
            screenName,
            errorCode,
            isBlocked,
            blockReason
        });
    }).catch(logError => {
        console.error('Failed to log access:', logError);
    });
};