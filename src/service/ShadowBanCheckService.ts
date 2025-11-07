import { Log } from '../util/Log';
import { batchCheckTweets, fetchSearchSuggestionAsync, fetchSearchTimelineAsync, fetchUserByScreenNameAsync, getTimelineTweetInfo } from '../TwitterUtil/TwitterUtil';
import { ShadowBanCheckResult } from '../types/ShadowBanCheckResult';
import { generateRandomHexString } from '../FunctionUtil';
import { ShadowbanHistoryService } from './ShadowbanHistoryService';
import { PerformanceMonitor } from '../util/PerformanceMonitor';
import { authTokenService } from './TwitterAuthTokenService';

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
        let user = await fetchUserByScreenNameAsync(screenName);
        monitor.endOperation('fetchUser');

        const service = new ShadowbanHistoryService();
        const sessionId = generateRandomHexString(16);

        if (!user) {
            result.not_found = true;
            await service.createHistory(screenName, result, sessionId, ip);

            return result
        }

        // user.resultがundefinedの場合のリトライ処理
        if (!user.result) {
            Log.error(`user.result is undefined for screenName: ${screenName}`, user);

            const maxRetries = 3;
            let retryCount = 0;

            while (!user.result && retryCount < maxRetries) {
                // 現在使用中のトークンをバン
                await authTokenService.banTokenFor24HoursByAccountTrouble();

                // 少し待機してから再試行
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));

                Log.warn(`Retry ${retryCount + 1}/${maxRetries} for screenName: ${screenName}`);

                // 再度APIを呼び出し
                user = await fetchUserByScreenNameAsync(screenName);
                retryCount++;

                if (!user) {
                    Log.error(`Retry ${retryCount} returned null for screenName: ${screenName}`);
                    result.not_found = true;
                    await service.createHistory(screenName, result, sessionId, ip);
                    return result;
                }
            }

            // 最終的に失敗した場合
            if (!user.result) {
                Log.error(`All retries failed for screenName: ${screenName}. Total attempts: ${retryCount + 1}`);
                result.not_found = true;
                await service.createHistory(screenName, result, sessionId, ip);
                return result;
            }
        }

        result.user = user.result;

        if (user.result.__typename !== "User") {
            result.suspend = true;
            await service.createHistory(screenName, result, sessionId, ip);

            return result
        }

        if (user.result.legacy.protected === true) { // privacy.protected になるかも
            result.protect = true;
            await service.createHistory(screenName, result, sessionId, ip);

            return result
        }

        const userScreenName = user.result.core.screen_name; // 大文字・小文字などの表記を合わせるため取得した値を使用

        monitor.startOperation('fetchSearchTimeline');
        const searchTimeline = await fetchSearchTimelineAsync(userScreenName);
        monitor.endOperation('fetchSearchTimeline');

        Log.debug(`userScreenName: ${userScreenName}`);
        let searchBanFlag = true
        if (searchTimeline?.timeline?.instructions) {
            for (const instruction of searchTimeline.timeline.instructions) {
                if (!instruction.entries) continue
                for (const entry of instruction.entries) {
                    if (entry.entryId.startsWith('tweet-')) {
                        const screenNameInEntry = entry.content?.itemContent?.tweet_results?.result?.core?.user_results?.result?.legacy?.screen_name;
                        Log.debug(`Checking entry screen name: ${screenNameInEntry} against ${userScreenName}`);
                        if (screenNameInEntry === userScreenName) {
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
            const searchSuggestionUsers = await fetchSearchSuggestionAsync(userScreenName, userNameText);
            monitor.endOperation('fetchSearchSuggestion');
            return !searchSuggestionUsers.some(
                (suggestionUser: { screen_name: string }) => {
                    Log.debug(`Checking search suggestion user: ${suggestionUser.screen_name} against ${userScreenName} result: ${suggestionUser.screen_name === userScreenName}`);
                    return suggestionUser.screen_name === userScreenName
                }
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
                const tweetInfos = await getTimelineTweetInfo(userScreenName, userId, checkRepost);
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