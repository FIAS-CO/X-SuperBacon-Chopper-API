import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as TwitterUtil from '../../src/TwitterUtil/TwitterUtil';
import { CheckHistoryService } from '../../src/service/CheckHistoryService';
import { CheckStatus } from '../../src/types/Types';
import { Log } from '../../src/util/Log';

// CheckHistoryServiceをモック化
vi.mock('../../src/service/CheckHistoryService', () => {
    return {
        CheckHistoryService: vi.fn().mockImplementation(() => ({
            createCheckHistory: vi.fn().mockResolvedValue({}),
        }))
    };
});

describe('batchCheckTweetUrls', () => {
    const mockUrls = [
        'https://x.com/user1/status/123',
        'https://x.com/user2/status/456',
        'https://twitter.com/user3/status/789'
    ];
    const mockIp = '127.0.0.1';
    const mockSessionId = 'test-session-id';

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.AUTH_TOKEN = 'test-auth-token';
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should handle empty URLs array', async () => {
        const results = await TwitterUtil.batchCheckTweetUrls([], mockIp, mockSessionId);
        expect(results).toHaveLength(0);
    });

    // TODO checkTweetStatusのoembedUrlまわりがモック化できないためここらへんのテストが上手く動かない
    // it('should process multiple valid URLs correctly', async () => {
    //     // checkTweetStatusのモック
    //     vi.spyOn(TwitterUtil, 'checkTweetStatus').mockImplementation(async (url: string) => {
    //         const responses = {
    //             '123': { code: 200, status: 'AVAILABLE' as CheckStatus, message: 'Tweet is available' },
    //             '456': { code: 403, status: 'FORBIDDEN' as CheckStatus, message: 'Tweet is not available' },
    //             '789': { code: 404, status: 'NOT_FOUND' as CheckStatus, message: 'Tweet not found' }
    //         };

    //         const tweetId = url.split('/').pop() as string;
    //         return responses[tweetId];
    //     });

    //     const results = await TwitterUtil.batchCheckTweetUrls(mockUrls, mockIp, mockSessionId);

    //     expect(results).toHaveLength(3);
    //     expect(results[0].status).toBe('AVAILABLE');
    //     expect(results[1].status).toBe('FORBIDDEN');
    //     expect(results[2].status).toBe('NOT_FOUND');
    // });

    // it('should handle API errors gracefully', async () => {
    //     vi.spyOn(TwitterUtil, 'checkTweetStatus').mockImplementation(async () => {
    //         throw new Error('API Error');
    //     });

    //     const results = await TwitterUtil.batchCheckTweetUrls([mockUrls[0]], mockIp, mockSessionId);

    //     expect(results).toHaveLength(1);
    //     expect(results[0].status).toBe('UNKNOWN');
    //     expect(results[0].code).toBe(500);
    // });

    it('should check real tweets correctly', async () => {
        if (!process.env.AUTH_TOKEN) {
            Log.info('Skipping test: AUTH_TOKEN is not set');
            return;
        }

        const realUrls = [
            'https://x.com/connrori/status/1836787951558385822',        // 検索除外
            'https://x.com/EN_BlueArchive/status/184859425769277869',   // 存在しない
            'https://x.com/EN_BlueArchive/status/1848594257692778691',  // 検索OK
            'https://x.com/sig_illust/status/1852593341025956216'       // 引用先が除外
        ];

        // checkTweetStatusの実際の実装を使用
        const results = await TwitterUtil.batchCheckTweetUrls(realUrls, mockIp, mockSessionId);

        expect(results).toHaveLength(4);

        // 検索除外のツイート
        expect(results[0].url).toBe(realUrls[0]);
        expect(results[0].status).toBe('FORBIDDEN');

        // 存在しないツイート
        expect(results[1].url).toBe(realUrls[1]);
        expect(results[1].status).toBe('NOT_FOUND');

        // 検索OKのツイート
        expect(results[2].url).toBe(realUrls[2]);
        expect(results[2].status).toBe('AVAILABLE');

        // 引用先が除外されているツイート
        expect(results[3].url).toBe(realUrls[3]);
        expect(results[3].status).toBe('QUATE_FORBIDDEN');
    }, 30000);
});
