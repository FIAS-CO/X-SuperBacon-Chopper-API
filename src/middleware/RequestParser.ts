import { Context, Next } from 'hono';
import { serverDecryption } from '../util/ServerDecryption';
import { Log } from '../util/Log';

/**
 * リクエストデータのパースと前処理を行うミドルウェア
 * - JSONボディのパース
 * - 暗号化されたIPの復号化
 * - 接続情報の取得
 */
export const requestParser = async (c: Context, next: Next) => {
    try {
        // リクエストボディのパース
        const data = await c.req.json();

        // 暗号化されたIPの復号化
        let decryptedIp = '';
        if (data.key) {
            try {
                decryptedIp = await serverDecryption.decrypt(data.key);
            } catch (error) {
                Log.error('Failed to decrypt IP:', error);
            }
        }

        // 接続元IP情報の取得
        const connectionIp = c.req.header('x-forwarded-for') ||
            c.req.raw.headers.get('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            c.env?.remoteAddress ||
            'unknown';

        // Contextに保存（後続のミドルウェアで使用可能）
        c.set('requestData', data);
        c.set('ip', decryptedIp);
        c.set('connectionIp', connectionIp);

        Log.debug('Request parsed:', {
            endpoint: c.req.path,
            hasKey: !!data.key,
            ipDecrypted: !!decryptedIp
        });

    } catch (error) {
        Log.error('Error parsing request:', error);

        // パースエラーの場合もデフォルト値を設定
        c.set('requestData', {});
        c.set('ip', '');
        c.set('connectionIp', 'unknown');
    }

    await next();
};