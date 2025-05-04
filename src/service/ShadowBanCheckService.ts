import { Log } from '../util/Log';
import { batchCheckTweets, fetchSearchSuggestionAsync, fetchSearchTimelineAsync, fetchUserByScreenNameAsync, getTimelineTweetInfo } from '../TwitterUtil/TwitterUtil';
import { ShadowBanCheckResult } from '../types/ShadowBanCheckResult';
import { generateRandomHexString } from '../FunctionUtil';
import { ShadowbanHistoryService } from './ShadowbanHistoryService';
import { PerformanceMonitor } from '../util/PerformanceMonitor';

export class ShadowBanCheckService {
    async checkShadowBanStatus(
        screenName: string,
        ip: string,
        checkSearchBan: boolean,
        checkRepost: boolean
    ) {
        const monitor = new PerformanceMonitor();

        Log.info(`Check by user start. name:${screenName} searchban:${checkSearchBan} repost:${checkRepost}`)

        var result: ShadowBanCheckResult = {
            not_found: false,
            suspend: false,
            protect: false,
            no_tweet: false,
            search_ban: false,
            search_suggestion_ban: false,
            no_reply: false,
            ghost_ban: false,
            reply_deboosting: false,
            user: null,
            api_status: {
                userSearchGroup: {
                    rate_limit: true,
                    error: undefined as string | undefined
                },
                userTimelineGroup: {
                    rate_limit: true,
                    error: undefined as string | undefined
                }
            }
        }

        result.api_status.userSearchGroup.rate_limit = false;

        monitor.startOperation('fetchUser');
        const user = await fetchUserByScreenNameAsync(screenName);
        monitor.endOperation('fetchUser');

        const service = new ShadowbanHistoryService();
        const sessionId = generateRandomHexString(16);

        if (!user) {
            result.not_found = true;
            await service.createHistory(screenName, result, sessionId, ip);

            return result
        }

        result.user = user.result;

        if (user.result.__typename !== "User") {
            result.suspend = true;
            await service.createHistory(screenName, result, sessionId, ip);

            return result
        }

        if (user.result.legacy.protected === true) {
            result.protect = true;
            await service.createHistory(screenName, result, sessionId, ip);

            return result
        }

        const userScreenName = user.result.legacy.screen_name; // 大文字・小文字などの表記を合わせるため取得した値を使用

        monitor.startOperation('fetchSearchTimeline');
        const searchData = await fetchSearchTimelineAsync(screenName);
        monitor.endOperation('fetchSearchTimeline');

        const searchTimeline = searchData.data?.search_by_raw_query?.search_timeline;

        let searchBanFlag = true
        if (searchTimeline?.timeline?.instructions) {
            for (const instruction of searchTimeline.timeline.instructions) {
                if (!instruction.entries) continue
                for (const entry of instruction.entries) {
                    if (entry.entryId.startsWith('tweet-')) {
                        if (entry.content?.itemContent?.tweet_results?.result?.core?.user_results?.result?.legacy?.screen_name === userScreenName) {
                            searchBanFlag = false
                            break
                        }
                    }
                }
                if (!searchBanFlag) break
            }
        }
        result.search_ban = searchBanFlag;

        const searchSuggestionBanFlag = searchBanFlag || await (async () => {
            const userNameText = user.result.legacy.name;
            monitor.startOperation('fetchSearchSuggestion');
            const searchSuggestionUsers = await fetchSearchSuggestionAsync(screenName, userNameText);
            monitor.endOperation('fetchSearchSuggestion');
            return !searchSuggestionUsers.some(
                (suggestionUser: { screen_name: string }) => suggestionUser.screen_name === userScreenName
            );
        })();
        result.search_suggestion_ban = searchSuggestionBanFlag;

        result.api_status.userTimelineGroup.rate_limit = false;

        var checkedTweets = checkSearchBan ? await (async () => {
            try {
                monitor.startOperation('fetchUserId');
                const userId = user?.result?.rest_id;
                monitor.endOperation('fetchUserId');

                monitor.startOperation('fetchTimelineUrls');
                const tweetInfos = await getTimelineTweetInfo(userId, checkRepost);
                monitor.endOperation('fetchTimelineUrls');

                monitor.startOperation('batchCheckTweets');
                const tweets = await batchCheckTweets(tweetInfos, ip, sessionId, true);
                monitor.endOperation('batchCheckTweets');
                return tweets;
            } catch (error) {
                Log.error('Error checking tweets:', error);
                return [];
            }
        })() : undefined;

        const timings = monitor.getTimings();

        await service.createHistory(screenName, result, sessionId, ip);

        // 結果の返却
        return {
            ...result,
            user: user.result,
            tweets: checkedTweets,
            _debug: { timings }
        };
    }
}

// サービスのインスタンスをエクスポート
export const shadowBanCheckService = new ShadowBanCheckService();