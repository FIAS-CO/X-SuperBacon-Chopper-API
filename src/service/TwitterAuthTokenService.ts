import prisma from "../db";

export class TwitterAuthTokenService {
    /**
     * トークンを保存または更新する
     * @param token 保存するトークン
     * @returns 保存されたトークンのエントリ
     */
    async saveToken(token: string) {
        return await prisma.twitterAuthToken.upsert({
            where: {
                id: 1
            },
            update: {
                token: token
            },
            create: {
                id: 1,
                token: token
            }
        });
    }

    /**
     * 現在のトークンを取得する
     * @returns トークン。存在しない場合はnull
     */
    async getCurrentToken(): Promise<string | null> {
        const entry = await prisma.twitterAuthToken.findUnique({
            where: {
                id: 1
            }
        });

        return entry?.token ?? null;
    }

    /**
     * 現在のトークンを取得し、存在しない場合はエラーをスロー
     * @throws Error トークンが存在しない場合
     */
    async getRequiredToken(): Promise<string> {
        const token = await this.getCurrentToken();
        if (!token) {
            throw new Error('Auth token not found in database');
        }
        return token;
    }
}

// 共有インスタンスをエクスポート
export const authTokenService = new TwitterAuthTokenService();