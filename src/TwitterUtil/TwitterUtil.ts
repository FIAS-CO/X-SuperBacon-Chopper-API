import { StatusCode } from "hono/utils/http-status";
import { expandUrl } from "../UrlUtil";
import { generateRandomHexString } from "../FunctionUtil";
import { CheckStatus } from "../types/Types";
import prisma from "../db";

interface CheckResult {
    url: string;
    code: number;
    status: string;
    message: string;
    tweetDate?: string;
}

export async function batchCheckTweets(urls: string[], ip: string, withShadowBanCheck: boolean = false): Promise<CheckResult[]> {
    const BATCH_SIZE = 5;
    const results = [];

    // URLsを5個ずつの配列に分割
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batch = urls.slice(i, i + BATCH_SIZE);

        // 各バッチを並列処理
        const batchResults = await Promise.all(
            batch.map(async (inputUrl) => {
                try {
                    if (!inputUrl) {
                        return {
                            code: 400,
                            status: 'INVALID_URL' as const,
                            message: 'URL parameter is required',
                            url: inputUrl,
                            tweetDate: ''
                        };
                    }

                    const targetUrl = inputUrl.includes('t.co')
                        ? await expandUrl(inputUrl)
                        : inputUrl;

                    const statusResult = await checkTweetStatus(targetUrl, true);
                    const tweetDate = await fetchTweetCreatedAt(targetUrl);

                    // 履歴作成は後でバッチ処理する
                    return {
                        url: inputUrl,
                        tweetDate,
                        ...statusResult
                    };
                } catch (error) {
                    console.error('Error checking URL:', inputUrl, error);
                    return {
                        url: inputUrl,
                        code: 500,
                        status: 'UNKNOWN' as const,
                        message: 'Internal server error',
                        tweetDate: ''
                    };
                }
            })
        );

        results.push(...batchResults);
    }

    // 履歴のバッチ作成（非同期で実行）
    const sessionId = generateRandomHexString(16);
    const histories = results.map(result => ({
        username: getUserName(result.url),
        url: result.url,
        status: result.status,
        ip: ip,
        sessionId: sessionId,
        tweetDate: result.tweetDate
    }));

    // DBへの書き込みは非同期で行う
    Promise.all(
        histories.map(history =>
            createCheckHistory(
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

async function createCheckHistory(
    username: string,
    url: string,
    result: string,
    ip: string,
    sessionId: string,
    tweetDate: string,
    withShadowBanCheck: boolean = false
) {
    return await prisma.twitterCheck.create({
        data: {
            username: username,
            url: url,
            result: result,
            ip: ip,
            sessionId: sessionId,
            tweetDate: new Date(tweetDate),
            withShadowBanCheck: withShadowBanCheck
        }
    })
}

export async function fetchUserId(screenName: string) {
    // First, get userId from screen_name using usertest endpoint
    const searchParams = new URLSearchParams({
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
    })

    const headers = createHeader();

    const userResponse = await fetch(
        `https://api.twitter.com/graphql/k5XapwcSikNsEsILW5FvgA/UserByScreenName?${searchParams}`,
        { headers }
    )

    if (!userResponse.ok) {
        throw new Error(`Twitter API returned status: ${userResponse.status}`)
    }

    const { data: { user } } = await userResponse.json()
    const userId = user?.result?.rest_id
    return userId
}

function getUserName(url: string): string {
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
                console.log(tcoUrlsInResponse)
                const expandedUrls = await Promise.all(
                    tcoUrlsInResponse.map(url => expandUrl(url))
                );
                console.log(expandedUrls)

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

// Edgeのような User-Agent を設定
const EDGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Sec-Ch-Ua': '"Microsoft Edge";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
} as const

interface FetchResult {
    html: string;
    finalUrl: string;
}

// Cookie文字列からCookieオブジェクトを作成する関数
function parseCookie(cookieString: string): { name: string; value: string } {
    const [nameValue] = cookieString.split(';')
    const [name, value] = nameValue.split('=').map(s => s.trim())
    return { name, value }
}

// URLをフェッチする関数（リダイレクトにも対応）
export async function fetchWithRedirects(url: string, maxRedirects: number = 10): Promise<FetchResult> {
    let currentUrl = url
    let redirectCount = 0
    const cookies = new Map<string, string>()

    while (redirectCount < maxRedirects) {
        try {
            const response = await fetch(currentUrl, {
                headers: {
                    ...EDGE_HEADERS,
                    // 収集したクッキーがあれば設定
                    ...(cookies.size > 0 ? {
                        'Cookie': Array.from(cookies.entries())
                            .map(([name, value]) => `${name}=${value}`)
                            .join('; ')
                    } : {})
                },
                redirect: 'manual'
            })

            // Set-Cookieヘッダーの処理
            const setCookie = response.headers.get('set-cookie')
            if (setCookie) {
                // 複数のCookieが設定される可能性があるので、;で分割して処理
                setCookie.split(',').forEach(cookieStr => {
                    const { name, value } = parseCookie(cookieStr)
                    if (name && value) {
                        cookies.set(name, value)
                    }
                })
            }

            // リダイレクトの処理
            if (response.status === 301 || response.status === 302 || response.status === 307) {
                const location = response.headers.get('location')
                if (!location) {
                    throw new Error('Redirect location not found')
                }
                currentUrl = new URL(location, currentUrl).toString()
                redirectCount++

                // レスポンスボディを確認（JavaScriptリダイレクトの検出用）
                const text = await response.text()
                console.log(`Redirect ${redirectCount}: ${currentUrl}`)
                console.log(`Response body: ${text.substring(0, 200)}...`) // デバッグ用に最初の200文字を出力
                console.log('Current cookies:', cookies)

                continue
            }

            // 成功した場合はHTMLを返す
            if (response.ok) {
                const html = await response.text()
                console.log(`Final URL: ${currentUrl}`)
                console.log(`Response size: ${html.length} bytes`)
                return {
                    html,
                    finalUrl: currentUrl
                }
            }

            // エラーステータスの場合
            throw new Error(`HTTP Error: ${response.status}`)

        } catch (error) {
            console.error(`Fetch error for ${currentUrl}:`, error)
            throw error
        }
    }

    throw new Error('Max redirects exceeded')
}

// HTMLからURLを抽出する関数
export function extractUrlsFromHtml(html: string): string[] {
    const urls: string[] = []

    try {
        // デバッグ用にHTMLの一部を出力
        console.log('HTML preview:', html.substring(0, 500))

        // status URLsの抽出（複数のパターンに対応）
        const patterns = [
            /<a[^>]*href="(\/[^\/][^"]*\/status\/\d+)"[^>]*>/g,
            /<link[^>]*href="(https:\/\/twitter\.com\/[^\/]+\/status\/\d+)"[^>]*>/g,
            /<meta[^>]*content="(https:\/\/twitter\.com\/[^\/]+\/status\/\d+)"[^>]*>/g
        ]

        patterns.forEach(pattern => {
            let match
            while ((match = pattern.exec(html)) !== null) {
                if (match[1]) {
                    // 相対URLを絶対URLに変換
                    const absoluteUrl = match[1].startsWith('http')
                        ? match[1]
                        : new URL(match[1], 'https://twitter.com').toString()
                    urls.push(absoluteUrl)
                    console.log('Found URL:', absoluteUrl)
                }
            }
        })
    } catch (error) {
        console.error('Error in URL extraction:', error)
    }

    // 重複を除去
    return [...new Set(urls)]
}

// 認証ページかどうかをチェックする関数
export function isAuthenticationPage(html: string): boolean {
    const authIndicators = [
        'meta http-equiv="refresh"',
        'document.location =',
        '"/x/migrate?tok=',
        'login',
        'sign in',
        'authenticate'
    ]

    const lowerHtml = html.toLowerCase()
    return authIndicators.some(indicator => lowerHtml.includes(indicator.toLowerCase()))
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

function getTweetCreatedAt(data: any): string {
    try {
        const created_at = data?.data?.threaded_conversation_with_injections_v2?.instructions?.[0]
            ?.entries?.[0]?.content?.itemContent?.tweet_results?.result?.legacy?.created_at;
        return created_at || "1970/01/01 00:00:00";
    } catch (error) {
        console.error('Error extracting tweet date:', error);
        throw error;
    }
}

export async function fetchTweetCreatedAt(targetUrl: string): Promise<string> {
    var tweetId;
    try {
        tweetId = extractTweetId(targetUrl)
    } catch (error) {
        return "1970/01/01 00:00:00";
    }

    const searchParams = new URLSearchParams({
        "variables": JSON.stringify({
            "focalTweetId": tweetId,
            "with_rux_injections": false,
            "rankingMode": "Relevance",
            "includePromotedContent": true,
            "withCommunity": true,
            "withQuickPromoteEligibilityTweetFields": true,
            "withBirdwatchNotes": true,
            "withVoice": true
        }),
        "features": JSON.stringify({
            "rweb_tipjar_consumption_enabled": true,
            "responsive_web_graphql_exclude_directive_enabled": true,
            "verified_phone_label_enabled": false,
            "creator_subscriptions_tweet_preview_api_enabled": true,
            "responsive_web_graphql_timeline_navigation_enabled": true,
            "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false,
            "communities_web_enable_tweet_community_results_fetch": true,
            "c9s_tweet_anatomy_moderator_badge_enabled": true,
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
            "responsive_web_enhance_cards_enabled": false
        }),
        "fieldToggles": JSON.stringify({
            "withArticleRichContentState": true,
            "withArticlePlainText": false,
            "withGrokAnalyze": false,
            "withDisallowedReplyControls": false
        })
    });

    const headers = createHeader();
    const response = await fetch(
        `https://x.com/i/api/graphql/nBS-WpgA6ZG0CyNHD517JQ/TweetDetail?${searchParams}`,
        { headers }
    );

    if (!response.ok) {
        return "1970/01/01 00:00:00"
    }

    const data = await response.json();
    return getTweetCreatedAt(data);
}

export async function fetchUserByScreenNameAsync(screenName: string): Promise<any> {
    const headers = createHeader();

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

    if (!userResponse.ok) {
        throw new Error(`Twitter API returned status: ${userResponse.status}`)
    }

    const { data: { user } } = await userResponse.json()

    return user;
}


export async function fetchSearchTimelineAsync(screenName: string): Promise<any> {
    const headers = createHeader();
    const searchParams = new URLSearchParams({
        "variables": JSON.stringify({
            "rawQuery": `from:${screenName}`,
            "count": 20,
            "querySource": "recent_search_click",
            "product": "Top"
        }),
        "features": JSON.stringify({
            "profile_label_improvements_pcf_label_in_post_enabled": false,
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
            "responsive_web_enhance_cards_enabled": false
        })
    });

    const searchResponse = await fetch(
        `https://x.com/i/api/graphql/oyfSj18lHmR7VGC8aM2wpA/SearchTimeline?${searchParams}`,
        { headers }
    );

    if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error('Search API Error:', errorText);
        throw new Error(`Search API returned status: ${searchResponse.status}, Error: ${errorText}`);
    }

    const searchData = await searchResponse.json()

    return searchData
}

export async function fetchSearchSuggestionAsync(screenName: string, userNameText: string): Promise<any> {

    const headers = createHeader();

    const suggestionParams = new URLSearchParams({
        "include_ext_is_blue_verified": "1",
        "include_ext_verified_type": "1",
        "include_ext_profile_image_shape": "1",
        "q": `@${screenName} ${userNameText}`,
        "src": "search_box",
        "result_type": "events,users,topics,lists",
    })

    const suggestionResponse = await fetch(
        `https://api.twitter.com/1.1/search/typeahead.json?${suggestionParams}`,
        { headers }
    )

    if (!suggestionResponse.ok) {
        throw new Error(`Suggestion API returned status: ${suggestionResponse.status}`)
    }

    const { users: searchSuggestionUsers } = await suggestionResponse.json()

    return searchSuggestionUsers;
}

function createHeader() {
    const authToken = process.env.AUTH_TOKEN;
    if (!authToken) {
        throw new Error("AUTH_TOKEN is not defined");
    }
    const csrfToken = generateRandomHexString(16);

    return {
        Authorization:
            "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        Cookie: `auth_token=${authToken}; ct0=${csrfToken}`,
        "X-Csrf-Token": csrfToken,
    };
}
