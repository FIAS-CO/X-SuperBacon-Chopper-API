
export function generateRandomHexString(length: number) {
    let result = "";
    const characters = "0123456789abcdef";
    for (let i = 0; i < length * 2; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// URLリストを抽出する関数
interface Tweet {
    sortIndex: string;
    content: {
        itemContent: {
            tweet_results: {
                result: {
                    tweet?: Result;
                } & Result;
            }
        }
    }
}

interface Legacy {
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

interface Result {
    rest_id: string;
    core?: {
        user_results: {
            result: {
                legacy: {
                    screen_name: string;
                }
            }
        }
    },
    quoted_status_result: any,
    legacy: Legacy;
}

export function extractCursor(data: any, isAfterCursor: boolean = false): string {
    const index = isAfterCursor ? 1 : 2;
    try {
        const entries = data?.data?.user?.result?.timeline_v2?.timeline?.instructions?.[index]?.entries || [];
        return entries[entries.length - 1].content.value
    } catch (error) {
        console.error('Error extracting URLs:', error);
        return "";
    }
}

export async function getTimelineUrls(userId: string, containRepost: boolean): Promise<string[]> {
    const tweetInfos = await getTimelineTweetInfo(userId);

    return tweetInfos
        .filter(tweet => containRepost || (!tweet.isRetweet && !tweet.isQuated))
        .map(tweet => tweet.url);
}

export interface TweetInfo {
    url: string;           // ツイートのURL
    isRetweet: boolean;    // リツイートかどうか
    isQuated: boolean;
    hasMedia: boolean;     // 画像/動画/GIFを含むかどうか
}

/**
 * タイムラインからツイート情報を抽出
 */
export async function getTimelineTweetInfo(userId: string): Promise<TweetInfo[]> {
    const DESIRED_COUNT = 20;
    const authToken = process.env.AUTH_TOKEN;
    if (!authToken) {
        throw new Error("AUTH_TOKEN is not defined");
    }

    let allTweetInfos: TweetInfo[] = [];
    let cursor: string = "";
    let isAfterCursor = false;

    while (allTweetInfos.length < DESIRED_COUNT) {
        // API呼び出し
        const response = await getResponse(authToken, userId, cursor);
        if (!response.ok) {
            throw new Error(`Twitter API returned status: ${response.status}`);
        }

        const data = await response.json();
        const newTweetInfos = extractTweetInfos(data, !!cursor);

        // 新しいツイートがない場合は終了
        if (newTweetInfos.length === 0) break;

        allTweetInfos = [...allTweetInfos, ...newTweetInfos];

        // 次のページのカーソルを取得
        cursor = extractCursor(data, isAfterCursor);

        isAfterCursor = true;
        // カーソルがない場合は終了（最後のページに到達）
        if (!cursor) break;
    }

    // 最大50件まで返す
    return allTweetInfos.slice(0, DESIRED_COUNT);
}

/**
 * タイムラインデータからツイート情報を抽出する補助関数
 */
function extractTweetInfos(data: any, isAfterCursor: boolean = false): TweetInfo[] {
    const index = isAfterCursor ? 1 : 2;
    try {
        const entries = data?.data?.user?.result?.timeline_v2?.timeline?.instructions?.[index]?.entries || [];
        const tweetInfos: TweetInfo[] = [];

        for (const entry of entries) {
            // TimelineTimelineItemのエントリーのみを処理
            if (entry?.content?.entryType === "TimelineTimelineItem" ||
                entry?.content?.entryType === "TimelineTimelineModule") {
                const tweet = entry as Tweet;
                const tweetResult = tweet?.content?.itemContent?.tweet_results?.result;

                // tweet_results.result.__typename = "TweetWithVisibilityResults"のときtweetResultの下がtweetになる
                if (tweetResult) {
                    const core = tweetResult.core || tweetResult.tweet?.core
                    const screenName = core?.user_results.result.legacy.screen_name;
                    const tweetId = tweetResult.rest_id || tweetResult.tweet?.rest_id;
                    const url = `https://x.com/${screenName}/status/${tweetId}`;

                    // 追加情報を取得
                    tweetInfos.push({
                        url: url,
                        isRetweet: isRetweet(tweet),
                        isQuated: isQuated(tweet),
                        hasMedia: hasPicOrVideo(tweet)
                    });
                }
            }
        }

        return tweetInfos;
    } catch (error) {
        console.error('Error extracting tweet infos:', error);
        return [];
    }
}

async function getResponse(authToken: string, userId: string, cursor: string = ""): Promise<Response> {
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

    return timelineResponse
}

/**
 * ツイートが画像、動画、GIFのいずれかのメディアを含むかどうかを判定
 */
export function hasPicOrVideo(tweet: Tweet): boolean {
    const tweetResult = tweet.content.itemContent.tweet_results.result
    const legacy = tweetResult.legacy || tweetResult.tweet?.legacy;
    if (!legacy) return false;

    // メディアを取得（extended_entitiesを優先）
    const media = legacy.extended_entities?.media || legacy.entities?.media || [];
    const mediaInRt = legacy.retweeted_status_result?.result?.legacy?.extended_entities?.media || [];

    // メディアが存在し、かつphoto/video/animated_gifのいずれかを含む
    return [...media, ...mediaInRt].some(m => ['photo', 'video', 'animated_gif'].includes(m.type));
}

/**
 * ツイートがリツイートかどうかを判定
 */
export function isRetweet(tweet: Tweet): boolean {
    const tweetResult = tweet.content.itemContent.tweet_results?.result;

    return tweetResult.legacy?.retweeted_status_result !== undefined
        || tweetResult.tweet?.legacy?.retweeted_status_result !== undefined;
}

export function isQuated(tweet: Tweet): boolean {
    const tweetResult = tweet.content.itemContent.tweet_results?.result;
    const quatedStatusResult: any = tweetResult.quoted_status_result;

    return quatedStatusResult != null;
}