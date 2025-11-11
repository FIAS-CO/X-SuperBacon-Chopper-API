import prisma from "../db";
import { AuthTokenSet } from "../types/Types";
import { DateUtil } from "../util/DateUtil";
import { Log } from "../util/Log";
import { DiscordChannel, discordNotifyService } from "./DiscordNotifyService";

export class TwitterAuthTokenService {
    /**
     * トークンを保存または更新する
     * @param token 保存するトークン
     * @returns 保存されたトークンのエントリ
     */
    async saveToken(token: string, csrfToken: string, accountId: string) {
        return await prisma.authToken.upsert({
            where: {
                accountId: accountId
            },
            update: {
                token: token,
                csrf_token: csrfToken,
                updatedAt: new Date()
            },
            create: {
                token: token,
                csrf_token: csrfToken,
                accountId: accountId,
                lastUsed: new Date("2000-01-01T00:00:00Z"),
                resetTime: new Date(),
                updatedAt: new Date()
            }
        });
    }

    /**
     * 現在のトークンを取得し、存在しない場合はエラーをスロー
     */
    async getRequiredTokenSet(): Promise<AuthTokenSet> {
        const now = new Date();

        /**
         * 現在時刻に基づいて1分ごとのタイムスロットを計算
         * 深夜0時からの経過分数
         */
        const timeSlot = now.getHours() * 60 + now.getMinutes();

        // 利用可能なトークンを取得
        const availableTokens = await prisma.authToken.findMany({
            where: {
                resetTime: { lt: now } // 制限解除済みのもののみ
            },
            orderBy: { id: 'asc' } // 安定したソート順
        });

        // 利用可能なトークンがない場合（全てレート制限中の場合）
        if (availableTokens.length === 0) {
            this.notifyNoToken();
            throw new Error('Auth token not available: all tokens are rate limited');
        }

        // 利用可能なトークン数に対するmodを取って選択
        const selectedIndex = timeSlot % availableTokens.length;
        const selectedToken = availableTokens[selectedIndex];

        // 使用記録を更新
        await prisma.authToken.update({
            where: { id: selectedToken.id },
            data: { lastUsed: now }
        });

        return {
            token: selectedToken.token,
            csrfToken: selectedToken.csrf_token
        };
    }

    updateRateLimitByUnixTime(token: string, remaining: number, resetTimeUnix: number) {
        if (remaining != 0) return;

        this.updateTokenResetTime(token, resetTimeUnix);
    }

    // レスポンスヘッダーからレート制限情報を更新   
    updateRateLimit(token: string, headers: Headers) {
        const remaining = parseInt(headers.get('x-rate-limit-remaining') || '0');
        const resetTime = parseInt(headers.get('x-rate-limit-reset') || '0');

        this.updateRateLimitByUnixTime(token, remaining, resetTime);
    }

    /**
     * トークンのレートリミット情報を更新
     * @param token 対象のトークン
     * @param resetTimeUnix レートリミット解除時刻（UNIXタイムスタンプ）
     */
    async updateTokenResetTime(token: string, resetTimeUnix: number): Promise<void> {
        if (resetTimeUnix <= 0) return;

        const currentToken = await prisma.authToken.findUnique({
            where: { token: token }
        });

        const resetTime = new Date(resetTimeUnix * 1000); // UNIXタイムスタンプをDateに変換

        // 現在のresetTimeと新しいresetTimeが同じ場合は更新しない
        if (currentToken && currentToken.resetTime.getTime() === resetTime.getTime()) {
            Log.info(`トークン ${token.substring(0, 5)}... の resetTime は既に最新です`);
            return;
        }

        await prisma.authToken.update({
            where: {
                token: token
            },
            data: {
                resetTime: resetTime
            }
        });

        this.notifyRateLimit(token, DateUtil.formatJST(resetTime))
    }

    async deleteTokenByAccountId(accountId: string): Promise<any> {
        try {
            const deletedToken = await prisma.authToken.delete({
                where: {
                    accountId: accountId
                }
            });

            this.notifyTokenDeleted(deletedToken.token, deletedToken.accountId);

            return deletedToken;
        } catch (error) {
            Log.error(`トークン削除中にエラーが発生しました: `, error);
            return null;
        }
    }

    /**
     * 無効になったトークンを削除する
     * @param token 削除するトークン
     * @returns 削除されたトークンの情報、存在しない場合はnull
     */
    async deleteToken(token: string): Promise<any> {
        try {
            const deletedToken = await prisma.authToken.delete({
                where: {
                    token: token
                }
            });

            this.notifyTokenDeleted(deletedToken.token, deletedToken.accountId);

            return deletedToken;
        } catch (error) {
            Log.error(`トークン削除中にエラーが発生しました: `, error);
            return null;
        }
    }

    /**
     * トークン削除の通知メソッド
     */
    async notifyTokenDeleted(token: string, accountId: string): Promise<void> {
        Log.info(`認証トークンが削除されました: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`);
        discordNotifyService.sendMessage(`
🗑️ **認証トークンが削除されました**
**Token:** ${token.substring(0, 5)}...${token.substring(token.length - 5)}
**Account:** ${accountId}
            `, DiscordChannel.TOKEN_RELATED);
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

        const resetTimeJst = DateUtil.formatJST(resetTime)
        // TODO ログにアカウント名を含める
        // ログ出力
        Log.warn(`Token banned until ${resetTimeJst} due to rate limit`);

        this.notifyRateLimitWithRateRemaining(token, resetTimeJst);
    }

    async banTokenFor24HoursByAccountTrouble(): Promise<void> {
        const token = await this.getRequiredTokenSet().then(tokenSet => tokenSet.token);

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

        const resetTimeJst = DateUtil.formatJST(resetTime)
        // TODO ログにアカウント名を含める
        // ログ出力
        Log.warn(`Token banned until ${resetTimeJst}.`);

        this.notifyRateLimitWithAccountTrouble(token, resetTimeJst);
    }

    async notifyNoToken(): Promise<void> {
        const tokens = await authTokenService.getAllTokens();

        // トークン情報をフィールドとして整形
        const tokenFields = tokens.map(token => {

            return {
                name: `トークン: ${token.token}`,
                value: `XのID: ${token.accountId}\nResetTime: ${token.resetTime}`
            };
        });

        await discordNotifyService.sendEmbed({
            title: "🚨 トークンが全滅しました",
            description: "利用可能なトークンがありません。トークンを追加してください。",
            color: 0xFF0000, // 赤色
            fields: tokenFields
        });
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
            // 日付を日本時間に変換
            const lastUsedJST = DateUtil.formatJST(token.lastUsed);
            const resetTimeJST = DateUtil.formatJST(token.resetTime);
            const updatedAtJST = DateUtil.formatJST(token.updatedAt);

            return {
                id: token.id,
                accountId: token.accountId,
                token: token.token,
                csrfToken: token.csrf_token,
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
     * @returns トークンセット。存在しない場合はnull
     */
    async getTokenByAccountId(accountId: string): Promise<AuthTokenSet | null> {
        const entry = await prisma.authToken.findUnique({
            where: {
                accountId: accountId
            }
        });

        if (!entry) {
            return null;
        }

        return {
            token: entry.token,
            csrfToken: entry.csrf_token
        };
    }

    /**
     * 指定したトークンに対応するアカウントIDを取得
     * @param token トークン
     * @returns アカウントID。存在しない場合は "NoUser"
     */
    async getAccountIdByToken(token: string): Promise<string> {
        const entry = await prisma.authToken.findUnique({
            where: {
                token: token
            }
        });

        return entry?.accountId ?? "NoUser";
    }

    // レートリミット警告用のヘルパーメソッド
    async notifyRateLimit(authToken: string, resetTime: string): Promise<void> {
        const account = await authTokenService.getAccountIdByToken(authToken);
        const message = `
📢 **トークンのリメインが尽きた報告だよ。対応は不要だよ。**
**Token:** ${authToken}
**Account:** ${account}
**Reset Time:** ${resetTime}
        `.trim();

        await discordNotifyService.sendMessage(message, DiscordChannel.TOKEN_RELATED);
    }

    async notifyRateLimitWithRateRemaining(authToken: string, resetTime: string): Promise<void> {
        const account = await authTokenService.getAccountIdByToken(authToken);
        const message = `
📢 **リメインが残っているのにトークンのレートが制限されたよ。対応は不要だよ。**
**Token:** ${authToken}
**Account:** ${account}
**Reset Time:** ${resetTime}
        `.trim();

        await discordNotifyService.sendMessage(message, DiscordChannel.TOKEN_RELATED);
    }

    async notifyRateLimitWithAccountTrouble(authToken: string, resetTime: string): Promise<void> {
        const account = await authTokenService.getAccountIdByToken(authToken);
        const message = `
📢 **アカウントに何かエラーっぽい挙動があったので制限したよ。アカウントを確認してください。**
**Token:** ${authToken}
**Account:** ${account}
**Reset Time:** ${resetTime}
        `.trim();

        await discordNotifyService.sendMessage(message, DiscordChannel.TOKEN_RELATED);
    }
}

// 共有インスタンスをエクスポート
export const authTokenService = new TwitterAuthTokenService();