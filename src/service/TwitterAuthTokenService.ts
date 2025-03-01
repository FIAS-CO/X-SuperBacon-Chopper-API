import prisma from "../db";
import { DateUtil } from "../util/DateUtil";
import { Log } from "../util/Log";
import { discordNotifyService } from "./DiscordNotifyService";

export class TwitterAuthTokenService {
    /**
     * トークンを保存または更新する
     * @param token 保存するトークン
     * @returns 保存されたトークンのエントリ
     */
    async saveToken(token: string, accountId: string) {
        return await prisma.authToken.upsert({
            where: {
                accountId: accountId
            },
            update: {
                token: token,
                updatedAt: new Date()
            },
            create: {
                token: token,
                accountId: accountId,
                lastUsed: new Date("2000-01-01T00:00:00Z"),
                resetTime: new Date()
            }
        });
    }

    /**
     * 現在のトークンを取得し、存在しない場合はエラーをスロー
     * @throws Error トークンが存在しない場合
     */
    async getRequiredToken(): Promise<string> {
        // 現在時刻の取得
        const now = new Date();

        // レート制限が解除されているトークンの中で、最も長く使われていないものを取得
        const token = await prisma.authToken.findFirst({
            where: {
                resetTime: {
                    lt: now // resetTimeが現在時刻より前（制限解除済み）のみを条件に
                }
            },
            orderBy: {
                lastUsed: 'asc', // 最も長く使われていないものを選択
            },
        });

        // トークンが見つからない場合（全てレート制限中の場合）
        if (!token) {
            this.notifyNoToken();
            throw new Error('Auth token not available: all tokens are rate limited');
        }

        // 使用したトークンの最終使用時間を更新
        await prisma.authToken.update({
            where: {
                id: token.id
            },
            data: {
                lastUsed: now
            }
        });

        Log.info(`AuthToken: ${token.token}`)
        return token.token;
    }

    // レスポンスヘッダーからレート制限情報を更新   
    updateRateLimit(token: string, headers: Headers) {
        const remaining = parseInt(headers.get('x-rate-limit-remaining') || '0');
        const resetTime = parseInt(headers.get('x-rate-limit-reset') || '0');

        if (remaining != 0) return;

        this.updateTokenResetTime(token, resetTime);
    }

    /**
     * トークンのレートリミット情報を更新
     * @param token 対象のトークン
     * @param resetTimeUnix レートリミット解除時刻（UNIXタイムスタンプ）
     */
    async updateTokenResetTime(token: string, resetTimeUnix: number): Promise<void> {
        if (resetTimeUnix <= 0) return;

        const resetTime = new Date(resetTimeUnix * 1000); // UNIXタイムスタンプをDateに変換
        await prisma.authToken.update({
            where: {
                token: token
            },
            data: {
                resetTime: resetTime
            }
        });
    }

    /**
    * 指定したトークンのresetTimeを24時間後に設定する
    * レート制限エラー(429)が発生した場合に呼び出す
    * @param token バンするトークン
    * @returns 更新されたトークン情報
    */
    async banTokenFor24Hours(token: string): Promise<void> {
        // 現在時刻の24時間後を計算
        const resetTime = new Date();
        resetTime.setHours(resetTime.getHours() + 24);

        // トークンのresetTimeを更新
        await prisma.authToken.update({
            where: {
                token: token
            },
            data: {
                resetTime: resetTime
            }
        });

        // ログ出力
        console.log(`Token banned until ${resetTime.toISOString()} due to rate limit`);
    }

    async notifyNoToken(): Promise<void> {
        const tokens = this.getAllTokens();

        const message = `
        🚨 **トークンが全滅しました。トークンを追加してください。**
        **現在のトークン一覧:**
        ${tokens}`
        await discordNotifyService.sendMessage(message);
    }

    /**
     * 全てのトークンを取得
     * @returns トークンのリスト
     */
    async getAllTokens() {
        const tokens = await prisma.authToken.findMany({
            orderBy: {
                id: 'asc'
            }
        });

        // レスポンスのためにトークンを整形（機密情報を部分的に隠す）
        const safeTokens = tokens.map(token => {
            // トークンの一部を隠す
            const maskedToken = token.token.substring(0, 5) + '...' + token.token.substring(token.token.length - 5);

            // 日付を日本時間に変換
            const lastUsedJST = DateUtil.formatJST(token.lastUsed);
            const resetTimeJST = DateUtil.formatJST(token.resetTime);
            const updatedAtJST = DateUtil.formatJST(token.updatedAt);

            return {
                id: token.id,
                accountId: token.accountId,
                token: maskedToken,
                lastUsed: lastUsedJST,
                resetTime: resetTimeJST,
                updatedAt: updatedAtJST,
                // 元の日付オブジェクトも含めておくと計算に便利
                resetTimeRaw: token.resetTime
            };
        });

        return safeTokens;
    }

    /**
     * 指定したアカウントIDのトークンを取得
     * @param accountId アカウントID
     * @returns トークン。存在しない場合はnull
     */
    async getTokenByAccountId(accountId: string): Promise<string | null> {
        const entry = await prisma.authToken.findUnique({
            where: {
                accountId: accountId
            }
        });

        return entry?.token ?? null;
    }
}

// 共有インスタンスをエクスポート
export const authTokenService = new TwitterAuthTokenService();