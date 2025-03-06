import { StatusCode } from "hono/utils/http-status";
import { expandUrl } from "../UrlUtil";
import { generateRandomHexString } from "../FunctionUtil";
import { CheckStatus } from "../types/Types";
import { CheckHistoryService } from "../service/CheckHistoryService";
import { authTokenService } from "../service/TwitterAuthTokenService";
import { Log } from "../util/Log";
import { discordNotifyService } from "../service/DiscordNotifyService";

interface CheckResult {
    url: string;
    code: number;
    status: string;
    message: string;
    tweetDate: string;
    isPinned: boolean;
}

export async function batchCheckTweetUrls(urls: string[], ip: string, sessionId: string, withShadowBanCheck: boolean = false): Promise<CheckResult[]> {
    const tweetInfos: TweetInfo[] = urls.map(url =>
        ({ url: url, isRetweet: false, isQuated: false, hasMedia: false, isPinned: false }));
    return batchCheckTweets(tweetInfos, ip, sessionId, withShadowBanCheck);
}

export async function batchCheckTweets(tweetInfos: TweetInfo[], ip: string, sessionId: string, withShadowBanCheck: boolean = false): Promise<CheckResult[]> {
    const BATCH_SIZE = 5;
    const results: CheckResult[] = [];

    // URLsを5個ずつの配列に分割
    for (let i = 0; i < tweetInfos.length; i += BATCH_SIZE) {
        const batch = tweetInfos.slice(i, i + BATCH_SIZE);

        // 各バッチを並列処理
        const batchResults: CheckResult[] = await Promise.all(
            batch.map(async (info) => {
                const inputUrl = info.url;
                try {
                    if (!inputUrl) {
                        return {
                            code: 400,
                            status: 'INVALID_URL' as const,
                            message: 'URL parameter is required',
                            url: inputUrl,
                            tweetDate: '',
                            isPinned: false
                        };
                    }

                    const targetUrl = inputUrl.includes('t.co')
                        ? await expandUrl(inputUrl)
                        : inputUrl;

                    const statusResult = await checkTweetStatus(targetUrl, true);
                    const tweetDate = "1970/01/01 00:00:00";

                    // 履歴作成は後でバッチ処理する
                    return {
                        url: inputUrl,
                        code: statusResult.code,
                        status: statusResult.status,
                        message: statusResult.message,
                        tweetDate: tweetDate,
                        isPinned: info.isPinned
                    };
                } catch (error) {
                    console.error('Error checking URL:', inputUrl, error);
                    return {
                        url: inputUrl,
                        code: 500,
                        status: 'UNKNOWN' as const,
                        message: 'Internal server error',
                        tweetDate: '',
                        isPinned: false
                    };
                }
            })
        );

        results.push(...batchResults);
    }

    // 履歴のバッチ作成（非同期で実行）
    const histories = results.map(result => ({
        username: pickScreenName(result.url),
        url: result.url,
        status: result.status,
        ip: ip,
        sessionId: sessionId,
        tweetDate: result.tweetDate
    }));

    const service = new CheckHistoryService();
    // DBへの書き込みは非同期で行う
    Promise.all(
        histories.map(async history =>
            await service.createCheckHistory(
                history.username,
                history.url,
                history.status,
                history.ip,
                history.sessionId,
                history.tweetDate,
                withShadowBanCheck
            )
        )
    ).catch(error => {
        console.error('Error creating check histories:', error);
    });

    return results;
}

interface TweetStatus {
    code: StatusCode;
    status: CheckStatus;
    message: string;
    oembedData?: any;
}

function pickScreenName(url: string): string {
    try {
        const parsedUrl = new URL(url);

        // パスが/userId/status/tweetIdの形式であることを確認
        const pathParts = parsedUrl.pathname.split('/').filter(part => part !== '');
        return pathParts[0];
    } catch {
        return "getUserName Error";
    }
}

// URLが正しい形式かチェックする関数
function isValidTweetUrl(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        // ホストがx.comまたはtwitter.comであることを確認
        if (parsedUrl.hostname !== 'x.com' && parsedUrl.hostname !== 'twitter.com') {
            return false;
        }

        // パスが/userId/status/tweetIdの形式であることを確認
        const pathParts = parsedUrl.pathname.split('/').filter(part => part !== '');
        return pathParts.length >= 3 && pathParts[1] === 'status';
    } catch {
        return false;
    }
}

function cleanPhotoUrl(url: string): string {
    return url.replace(/\/photo\/\d+\/?$/, '');
}

function extractTcoUrls(html: string): string[] {
    // t.co URLを抽出する正規表現
    const tcoUrlPattern = /https:\/\/t\.co\/[a-zA-Z0-9]+/g;

    // 全てのマッチを取得
    const matches = html.match(tcoUrlPattern);

    if (!matches) {
        return [];
    }

    // 重複を削除して返す
    return [...new Set(matches)];
}

export async function checkTweetStatus(url: string, isRecursive: boolean): Promise<TweetStatus> {
    if (!isValidTweetUrl(url)) {
        return {
            code: 400 as StatusCode,
            status: 'INVALID_URL',
            message: 'Invalid tweet URL format. URL must be in the format: https://x.com/userId/status/tweetId or https://twitter.com/userId/status/tweetId'
        };
    }

    const cleanedUrl = cleanPhotoUrl(url);

    const oembedUrl = new URL('https://publish.twitter.com/oembed')
    oembedUrl.searchParams.append('url', cleanedUrl)
    oembedUrl.searchParams.append('partner', '')
    oembedUrl.searchParams.append('hide_thread', 'false')

    try {
        const response = await fetch(oembedUrl.toString())
        // 404の場合
        if (response.status === 404) {
            return {
                code: 404 as StatusCode,
                status: 'NOT_FOUND',
                message: 'Tweet not found'
            };
        }

        if (response.status === 403) {
            return {
                code: 403 as StatusCode,
                status: 'FORBIDDEN',
                message: 'you are not authorized to see this status.'
            };
        }

        // その他のエラーレスポンスの場合
        if (!response.ok) {
            return {
                code: response.status as StatusCode,
                status: 'UNKNOWN',
                message: `Tweet not available (${response.status} ${response.statusText})`
            };
        }

        const data = await response.json()
        const responseStr = JSON.stringify(data).toLowerCase()

        // アクセス制限されているケース たぶんいらない
        if (responseStr.includes("sorry, you are not authorized to see this status")) {
            return {
                code: 403 as StatusCode,
                status: 'FORBIDDEN',
                message: 'This tweet is not available'
            };
        }

        // 正常なケース
        if (data.html) {
            if (isRecursive) {
                const tcoUrlsInResponse = extractTcoUrls(data.html)
                const expandedUrls = await Promise.all(
                    tcoUrlsInResponse.map(url => expandUrl(url))
                );

                for (const url of expandedUrls) {
                    const result = await checkTweetStatus(url, false);
                    if (result.status === 'FORBIDDEN') {
                        return {
                            code: 410 as StatusCode,
                            status: 'QUATE_FORBIDDEN',
                            message: 'Quoted tweet is FORBIDDEN',
                            oembedData: data
                        };
                    }
                }
            }

            return {
                code: 200 as StatusCode,
                status: 'AVAILABLE',
                message: 'Tweet is available',
                oembedData: data
            };
        }

        // その他の不明なケース
        return {
            code: 520 as StatusCode,
            status: 'UNKNOWN',
            message: 'Unable to check tweet status'
        };

    } catch (error) {
        return {
            code: 500 as StatusCode,
            status: 'UNKNOWN',
            message: 'Failed to check tweet status'
        };
    }
}

export function extractTweetId(url: string): string {
    try {
        const match = url.match(/\/status\/(\d+)/);
        return match ? match[1] : "invalid_id";
    } catch (error) {
        console.error('Error extracting tweet ID:', error);
        return "invalid_id";
    }
}

export async function fetchUserByScreenNameAsync(screenName: string): Promise<any> {
    const authToken = await authTokenService.getRequiredToken();
    const headers = await createHeader(authToken);

    const userParams = new URLSearchParams({
        "variables": JSON.stringify({
            "screen_name": screenName,
            "withSafetyModeUserFields": true,
        }),
        "features": JSON.stringify({
            "hidden_profile_likes_enabled": true,
            "hidden_profile_subscriptions_enabled": true,
            "responsive_web_graphql_exclude_directive_enabled": true,
            "verified_phone_label_enabled": false,
            "subscriptions_verification_info_is_identity_verified_enabled": true,
            "subscriptions_verification_info_verified_since_enabled": true,
            "highlights_tweets_tab_ui_enabled": true,
            "responsive_web_twitter_article_notes_tab_enabled": true,
            "creator_subscriptions_tweet_preview_api_enabled": true,
            "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false,
            "responsive_web_graphql_timeline_navigation_enabled": true,
        }),
        "fieldToggles": JSON.stringify({
            "withAuxiliaryUserLabels": false,
        }),
    });

    const userResponse = await fetch(
        `https://api.twitter.com/graphql/k5XapwcSikNsEsILW5FvgA/UserByScreenName?${userParams}`,
        { headers }
    );
    authTokenService.updateRateLimit(authToken, userResponse.headers);

    if (!userResponse.ok) {
        return await handleTwitterApiError(userResponse, authToken, 'UserByScreenName');
    }

    const { data: { user } } = await userResponse.json()

    if (!user.result) {
        discordNotifyService.sendMessage(`
  🚨 **ユーザーの人間証明が求められてるかも。対応してください。**
  **Token:** ${authToken}
  **Account:** ${authTokenService.getAccountIdByToken(authToken)}
         `.trim());
    }

    return user;
}


export async function fetchSearchTimelineAsync(screenName: string): Promise<any> {
    const authToken = await authTokenService.getRequiredToken();
    const headers = await createHeader(authToken);
    const searchParams = new URLSearchParams({
        "variables": JSON.stringify({
            "rawQuery": `from:${screenName}`,
            "count": 20,
            "querySource": "recent_search_click",
            "product": "Top"
        }),
        "features": JSON.stringify({
            "profile_label_improvements_pcf_label_in_post_enabled": true,
            "rweb_tipjar_consumption_enabled": true,
            "responsive_web_graphql_exclude_directive_enabled": true,
            "verified_phone_label_enabled": false,
            "creator_subscriptions_tweet_preview_api_enabled": true,
            "responsive_web_graphql_timeline_navigation_enabled": true,
            "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false,
            "premium_content_api_read_enabled": false,
            "communities_web_enable_tweet_community_results_fetch": true,
            "c9s_tweet_anatomy_moderator_badge_enabled": true,
            "responsive_web_grok_analyze_button_fetch_trends_enabled": false,
            "responsive_web_grok_analyze_post_followups_enabled": true,
            "responsive_web_jetfuel_frame": false,
            "responsive_web_grok_share_attachment_enabled": true,
            "articles_preview_enabled": true,
            "responsive_web_edit_tweet_api_enabled": true,
            "graphql_is_translatable_rweb_tweet_is_translatable_enabled": true,
            "view_counts_everywhere_api_enabled": true,
            "longform_notetweets_consumption_enabled": true,
            "responsive_web_twitter_article_tweet_consumption_enabled": true,
            "tweet_awards_web_tipping_enabled": false,
            "creator_subscriptions_quote_tweet_preview_enabled": false,
            "freedom_of_speech_not_reach_fetch_enabled": true,
            "standardized_nudges_misinfo": true,
            "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": true,
            "rweb_video_timestamps_enabled": true,
            "longform_notetweets_rich_text_read_enabled": true,
            "longform_notetweets_inline_media_enabled": true,
            "responsive_web_grok_image_annotation_enabled": false,
            "responsive_web_enhance_cards_enabled": false
        })
    });

    const searchResponse = await fetch(
        `https://x.com/i/api/graphql/1BP5aKg8NvTNvRCyyCyq8g/SearchTimeline?${searchParams}`,
        { headers }
    );
    authTokenService.updateRateLimit(authToken, searchResponse.headers);

    if (!searchResponse.ok) {
        return await handleTwitterApiError(searchResponse, authToken, 'SearchTimeline');
    }

    const searchData = await searchResponse.json()

    return searchData
}

export async function fetchSearchSuggestionAsync(screenName: string, userNameText: string): Promise<any> {

    const authToken = await authTokenService.getRequiredToken();
    const headers = await createHeader(authToken);

    const suggestionParams = new URLSearchParams({
        "include_ext_is_blue_verified": "1",
        "include_ext_verified_type": "1",
        "include_ext_profile_image_shape": "1",
        "q": `@${screenName}`,
        "src": "search_box",
        "result_type": "events,users,topics,lists",
    })

    const suggestionResponse = await fetch(
        `https://x.com/i/api/1.1/search/typeahead.json?${suggestionParams}`,
        { headers }
    )

    if (!suggestionResponse.ok) {
        throw new Error(`Suggestion API returned status: ${suggestionResponse.status}`)
    }

    const { users: searchSuggestionUsers } = await suggestionResponse.json()

    return searchSuggestionUsers;
}

interface Item {
    item: {
        itemContent: {
            tweet_results: {
                result: TweetResult
            }
        }
    }
}

// URLリストを抽出する関数
export interface Tweet {
    entryId: string;
    sortIndex: string;
    content: {
        items: Item[];
        entryType: string;
        itemContent: {
            tweet_results: {
                result: TweetResult;
            };
        };
        value?: string; // content.entryId が cursor- のときだけある
    };
}

interface UserResultLegacy {
    screen_name: string;
}

interface TweetResultLegacy {
    retweeted_status_result?: {
        result: any;
    };
    entities: {
        media?: {
            type: string;
            media_url_https: string;
            video_info?: {
                variants: {
                    content_type: string;
                    url: string;
                }[];
            };
        }[];
    };
    extended_entities?: {
        media: {
            type: string;
            media_url_https: string;
            video_info?: {
                variants: {
                    content_type: string;
                    url: string;
                }[];
            };
        }[];
    };
}

interface TweetResult {
    __typename: string;
    rest_id: string;
    tweet?: TweetResult;
    core?: {
        user_results: {
            result: {
                legacy: UserResultLegacy;
            };
        };
    };
    quoted_status_result: any;
    legacy: TweetResultLegacy;
}

interface TweetInfo {
    url: string; // ツイートのURL
    isRetweet: boolean; // リツイートかどうか
    isQuated: boolean;
    hasMedia: boolean; // 画像/動画/GIFを含むかどうか
    isPinned: boolean;
}

interface AddInstruction extends Instraction {
    entries?: Tweet[];
}

interface PinInstruction extends Instraction {
    entry: Tweet;
}

interface Instraction {
    type: string;
}

/**
 * タイムラインデータからツイート情報を抽出する補助関数
 */
function extractTweetInfos(data: any): TweetInfo[] {
    const tweetInfos: TweetInfo[] = [];

    try {
        const instructions: Instraction[] = data?.data?.user?.result?.timeline_v2?.timeline?.instructions || [];

        const timelineAddInstruction = instructions.find(
            instruction => instruction.type === "TimelineAddEntries"
        ) as AddInstruction;

        if (timelineAddInstruction?.entries) {
            timelineAddInstruction.entries.forEach(tweet => {
                pushTweet(tweetInfos, tweet);
            });
        }

        return tweetInfos;
    } catch (error) {
        console.error('Error extracting tweet infos:', error);
        return [];
    }

}

function extractPinnedTweetInfos(data: any): TweetInfo[] {
    const tweetInfos: TweetInfo[] = [];

    try {
        const instructions: Instraction[] = data?.data?.user?.result?.timeline_v2?.timeline?.instructions || [];

        const timelinePinInstruction = instructions.find(
            instruction => instruction.type === "TimelinePinEntry"
        ) as PinInstruction;

        if (timelinePinInstruction?.entry) {
            pushPinnedTweet(tweetInfos, timelinePinInstruction.entry);
        }

        return tweetInfos;
    } catch (error) {
        console.error('Error extracting tweet infos:', error);
        return [];
    }

}

function pushPinnedTweet(tweetInfos: TweetInfo[], tweet: Tweet) {
    pushTweet(tweetInfos, tweet, true);
}

function pushTweet(tweetInfos: TweetInfo[], tweet: Tweet, pinned = false) {
    if (tweet.content?.entryType === "TimelineTimelineItem") {
        const tweetResult = tweet?.content?.itemContent?.tweet_results?.result;
        if (tweetResult) {
            pushTweetInfo(tweetInfos, tweetResult, pinned);
        }
    } else if (tweet.content?.entryType === "TimelineTimelineModule") {
        const items: Item[] = tweet?.content?.items;

        items.forEach(item => {
            const tweetResult = item.item.itemContent.tweet_results?.result;
            if (tweetResult && tweetResult.__typename === "Tweet") {
                pushTweetInfo(tweetInfos, tweetResult, pinned);
            }
        });
    }
}

function pushTweetInfo(tweetInfos: TweetInfo[], tweetResult: TweetResult, pinned = false) {
    try {
        const core = tweetResult.core || tweetResult.tweet?.core;
        const userResultLegacy = core?.user_results.result.legacy;
        const screenName = userResultLegacy?.screen_name;

        const tweetId = tweetResult.rest_id || tweetResult.tweet?.rest_id;

        const url = `https://x.com/${screenName}/status/${tweetId}`;

        tweetInfos.push({
            url: url,
            isRetweet: isRetweet(tweetResult),
            isQuated: isQuated(tweetResult),
            hasMedia: false,
            isPinned: pinned,
        });
    } catch (error) {
        tweetInfos.push({
            url: `https://x.com/unknown/status/unknown`,
            isRetweet: false,
            isQuated: false,
            hasMedia: false,
            isPinned: pinned,
        });
    }
}

/**
 * ツイートが画像、動画、GIFのいずれかのメディアを含むかどうかを判定
 * 今は使っていないので一旦封印
 */
// function hasPicOrVideo(legacy?: Legacy): boolean {
//     if (!legacy) return false;

//     // メディアを取得（extended_entitiesを優先）
//     const media = legacy.extended_entities?.media || legacy.entities?.media || [];
//     const mediaInRt = legacy.retweeted_status_result?.result?.legacy?.extended_entities?.media || [];

//     // メディアが存在し、かつphoto/video/animated_gifのいずれかを含む
//     return [...media, ...mediaInRt].some(m => ['photo', 'video', 'animated_gif'].includes(m.type));
// }

function isQuated(tweetResult: TweetResult | undefined): boolean {
    try {
        if (!tweetResult) return false;
        return Boolean(tweetResult?.quoted_status_result?.result);
    } catch (error) {
        console.error('Error checking quoted status:', error);
        return false;
    }
}

/**
 * ツイートがリツイートかどうかを判定
 */
function isRetweet(tweetResult?: TweetResult): boolean {
    try {
        return Boolean(tweetResult?.legacy?.retweeted_status_result?.result);
    } catch (error) {
        console.error('Error checking Repost status:', error);
        return false;
    }
}

export function extractCursor(data: any): string {
    try {
        const instructions: AddInstruction[] = data?.data?.user?.result?.timeline_v2?.timeline?.instructions || [];

        const targetInstruction = instructions.find(
            instruction => instruction.type === "TimelineAddEntries"
        );

        if (!targetInstruction) {
            console.log("No TimelineAddEntries found");
            return "";
        }

        const timelineAddEntries = targetInstruction.entries || [];
        return timelineAddEntries[timelineAddEntries.length - 1].content.value ?? "";
    } catch (error) {
        console.error('Error extracting URLs:', error);
        return "";
    }
}

/**
 * タイムラインからツイート情報を抽出
 */
export async function getTimelineUrls(userId: string, containRepost: boolean): Promise<string[]> {
    const tweetInfos = await getTimelineTweetInfo(userId, containRepost);

    return tweetInfos
        .map(tweet => tweet.url);
}

export async function getTimelineTweetInfo(userId: string, containRepost: boolean): Promise<TweetInfo[]> {
    const DESIRED_COUNT = 20;
    const authToken = await authTokenService.getRequiredToken();
    if (!authToken) {
        throw new Error("AUTH_TOKEN is not defined");
    }

    let allTweetInfos: TweetInfo[] = [];
    let cursor: string = "";

    var isFirstTime = true;
    while (allTweetInfos.length < DESIRED_COUNT) {
        // API呼び出し
        const response = await fetchUserTweetsAsync(authToken, userId, cursor);
        if (!response.ok) {
            return await handleTwitterApiError(response, authToken, 'UserTweets');
        }

        const data = await response.json();

        if (isFirstTime) {
            allTweetInfos = [...allTweetInfos, ...extractPinnedTweetInfos(data)]
        }
        isFirstTime = false;

        const newTweetInfos = extractTweetInfos(data)
            .filter(tweet => containRepost || (!tweet.isRetweet && !tweet.isQuated));

        // 新しいツイートがない場合は終了
        if (newTweetInfos.length === 0) break;

        allTweetInfos = [...allTweetInfos, ...newTweetInfos];

        // 次のページのカーソルを取得
        cursor = extractCursor(data);

        // カーソルがない場合は終了（最後のページに到達）
        if (!cursor) break;
    }

    // 最大50件まで返す
    return allTweetInfos.slice(0, DESIRED_COUNT);
}

export async function fetchUserTweetsAsync(authToken: string, userId: string, cursor: string = ""): Promise<Response> {
    // CSRFトークンの生成
    const csrfToken = generateRandomHexString(16);

    const headers = {
        Authorization: "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        Cookie: `auth_token=${authToken}; ct0=${csrfToken}`,
        "X-Csrf-Token": csrfToken,
    };

    // Now get user's timeline
    const timelineParams = new URLSearchParams({
        variables: JSON.stringify({
            userId: userId,
            count: 20,
            cursor: cursor, //'DAABCgABGcvdSpV___AKAAIZyYBlGJqx0QgAAwAAAAIAAA',
            includePromotedContent: true,
            withQuickPromoteEligibilityTweetFields: true,
            withVoice: true,
            withV2Timeline: true
        }),
        features: JSON.stringify({
            rweb_tipjar_consumption_enabled: true,
            responsive_web_graphql_exclude_directive_enabled: true,
            verified_phone_label_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: true,
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            communities_web_enable_tweet_community_results_fetch: true,
            c9s_tweet_anatomy_moderator_badge_enabled: true,
            articles_preview_enabled: true,
            responsive_web_edit_tweet_api_enabled: true,
            graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
            view_counts_everywhere_api_enabled: true,
            longform_notetweets_consumption_enabled: true,
            responsive_web_twitter_article_tweet_consumption_enabled: true,
            tweet_awards_web_tipping_enabled: false,
            creator_subscriptions_quote_tweet_preview_enabled: false,
            freedom_of_speech_not_reach_fetch_enabled: true,
            standardized_nudges_misinfo: true,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
            rweb_video_timestamps_enabled: true,
            longform_notetweets_rich_text_read_enabled: true,
            longform_notetweets_inline_media_enabled: true,
            responsive_web_enhance_cards_enabled: false
        }),
        fieldToggles: JSON.stringify({
            withArticlePlainText: false
        })
    });

    const timelineResponse = await fetch(
        `https://x.com/i/api/graphql/Tg82Ez_kxVaJf7OPbUdbCg/UserTweets?${timelineParams}`,
        { headers }
    );
    authTokenService.updateRateLimit(authToken, timelineResponse.headers);

    return timelineResponse;
}

async function createHeader(authToken: string) {
    const csrfToken = generateRandomHexString(16);

    return {
        Authorization:
            "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        Cookie: `auth_token=${authToken}; ct0=${csrfToken}`,
        "X-Csrf-Token": csrfToken,
    };
}

/**
 * Twitter APIからのエラーレスポンスを処理する
 * @param response エラーとなったレスポンス
 * @param authToken 使用された認証トークン
 * @param contextName API呼び出しのコンテキスト名
 * @throws 常にエラーをスロー
 */
async function handleTwitterApiError(response: Response, authToken: string, contextName: string): Promise<never> {
    const errorText = await response.text();
    Log.error(`${contextName} API Error:`, errorText);

    if (response.status === 429) {
        // レート制限エラー
        await authTokenService.banTokenFor24Hours(authToken);
    } else if (response.status === 401) {
        // 認証エラー - トークンが無効
        Log.warn(`Auth token invalid (401): ${authToken.substring(0, 5)}...`);
        await authTokenService.deleteToken(authToken);
    } else {
        // その他のエラー
        await discordNotifyService.notifyApiError(
            response.status,
            errorText,
            contextName,
            authToken
        );
    }

    throw new Error(`${contextName} API returned status: ${response.status}, Error: ${errorText}`);
}