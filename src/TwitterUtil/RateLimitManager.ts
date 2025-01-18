import { Log } from "../util/Log";

class RateLimitManager {
    private rateLimits: Map<string, {
        remaining: number;
        resetTime: number;
    }> = new Map();

    // エンドポイントのグループ定義
    readonly endpointGroups = {
        userSearchGroup: [
            'UserByScreenName',
            'SearchTimeline'
        ],
        userTimelineGroup: [
            'UserTweets'
        ]
    };

    // グループ内の全エンドポイントのレート制限をチェック
    checkGroupRateLimit(group: string[]): {
        canProceed: boolean;
        resetTime?: number;
    } {
        this.displayAllRateLimits()
        let latestResetTime = 0;

        for (const endpoint of group) {
            const limit = this.rateLimits.get(endpoint);
            if (!limit) continue;

            const now = Date.now();
            if (now < limit.resetTime && limit.remaining <= 0) {
                latestResetTime = Math.max(latestResetTime, limit.resetTime);
                return {
                    canProceed: false,
                    resetTime: latestResetTime
                };
            }
        }

        return { canProceed: true };
    }

    // レスポンスヘッダーからレート制限情報を更新
    updateRateLimit(endpoint: string, headers: Headers) {
        const remaining = parseInt(headers.get('x-rate-limit-remaining') || '0');
        const resetTime = parseInt(headers.get('x-rate-limit-reset') || '0') * 1000;

        this.rateLimits.set(endpoint, {
            remaining,
            resetTime
        });

        const jstDate = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        const limit = this.rateLimits.get(endpoint);
        Log.info(`[${jstDate}] Rate limit updated for ${endpoint}:`, {
            remaining: limit?.remaining,
            resetTime: new Date(limit?.resetTime || 0).toISOString()
        });
    }

    displayAllRateLimits(): void {
        Log.info('=== Current Rate Limits ===');
        if (this.rateLimits.size === 0) {
            Log.info('No rate limits set');
            return;
        }

        this.rateLimits.forEach((limit, endpoint) => {
            const resetDate = new Date(limit.resetTime).toLocaleString();
            Log.info(`Endpoint: ${endpoint}- Remaining: ${limit.remaining}- Reset time: ${resetDate}`);
        });
    }
}

export const rateLimitManager = new RateLimitManager();