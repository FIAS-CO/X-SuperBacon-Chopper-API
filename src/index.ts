import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import {
  fetchUserByScreenNameAsync, fetchSearchTimelineAsync, fetchSearchSuggestionAsync,
  batchCheckTweets,
  fetchUserId,
  fetchUserTweetsAsync,
  getTimelineTweetInfo,
  batchCheckTweetUrls
} from './TwitterUtil/TwitterUtil'
import prisma from './db'
import { expandUrl } from './UrlUtil'
import { generateRandomHexString } from './FunctionUtil'
import { serverDecryption } from './util/ServerDecryption'
import { CheckHistoryService } from './service/CheckHistoryService'
import { PerformanceMonitor } from './util/PerformanceMonitor'
import { ShadowbanHistoryService } from './service/ShadowbanHistoryService'
import { fetchAuthToken } from './TwitterUtil/TwitterAuthUtil'
import { authTokenService, TwitterAuthTokenService } from './service/TwitterAuthTokenService'

type Bindings = {}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/*', cors())

// Health check endpoint
app.get('/', (c: Context) => c.json({ status: 'ok' }))

// OEmbed APIを呼び出す関数
async function fetchOembedData(url: string) {
  const oembedUrl = new URL('https://publish.twitter.com/oembed')
  oembedUrl.searchParams.append('url', url)
  oembedUrl.searchParams.append('partner', '')
  oembedUrl.searchParams.append('hide_thread', 'false')

  const response = await fetch(oembedUrl.toString())
  return await response.json()
}

// オリジナルのoembed APIエンドポイント
app.get('/api/oembed', async (c: Context) => {
  try {
    const inputUrl = c.req.query('url')

    if (!inputUrl) {
      return c.json({ error: 'URL parameter is required' }, 400)
    }

    // URLを展開（t.coの場合のみ）
    const targetUrl = inputUrl.includes('t.co')
      ? await expandUrl(inputUrl)
      : inputUrl

    const data = await fetchOembedData(targetUrl)
    return c.json(data)

  } catch (error) {
    console.error('Error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

app.post('/api/check-batch', async (c: Context) => {
  try {
    const body = await c.req.json();
    const urls: string[] = body.urls;
    const encryptedIp = body.key; // ユーザーにバレないよう偽装
    const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';

    if (!urls || !Array.isArray(urls)) {
      return c.json({ error: 'URLs array is required in request body' }, 400);
    }

    const sessionId = generateRandomHexString(16);

    // Process URLs in parallel using Promise.all
    const results = await batchCheckTweetUrls(urls, ip, sessionId);

    return c.json({
      results: results,
      sessionId: sessionId
    });

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
})

app.get('/api/get-history-2n7b4x9k5m1p3v8h6j4w', async (c: Context) => {
  try {
    const history = await prisma.twitterCheck.findMany({
      orderBy: {
        id: 'desc',
      }
    })

    function toJST(date: Date) {
      return date.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }) + ' JST'
    }

    // UTCから日本時間に変換
    const historyWithJST = history.map(({ ...record }) => {
      const date = toJST(new Date(record.date))
      const tweetDate = record.tweetDate ? toJST(new Date(record.tweetDate)) : ""
      return {
        ...record,
        date: date,
        tweetDate: tweetDate
      }
    })

    return c.json(historyWithJST)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to fetch users' }, 500)
  }
})

app.get('/api/get-history-shadowban-8f4k9p2m7n3x6v1q5w8d', async (c: Context) => {
  try {
    const history = await prisma.shadowBanCheck.findMany({
      orderBy: {
        id: 'desc',
      }
    })

    function toJST(date: Date) {
      return date.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }) + ' JST'
    }

    // UTCから日本時間に変換
    const historyWithJST = history.map(({ ...record }) => {
      const date = toJST(new Date(record.date))
      return {
        ...record,
        date: date,
      }
    })

    return c.json(historyWithJST)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to fetch users' }, 500)
  }
})

app.get('/api/get-history-by-session-id', async (c: Context) => {
  try {
    const sessionId = c.req.query('id')
    if (!sessionId) {
      return c.json({ error: 'URL parameter is required' }, 400)
    }
    const historyList = await new CheckHistoryService().getHistoryById(sessionId);
    return c.json(historyList)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to fetch users' }, 500)
  }
})

export interface ShadowBanCheckResult {
  not_found: boolean;
  suspend: boolean;
  protect: boolean;
  no_tweet: boolean;
  search_ban: boolean;
  search_suggestion_ban: boolean;
  no_reply: boolean;
  ghost_ban: boolean;
  reply_deboosting: boolean;
  user: any | null;
}

app.get('/api/check-by-user', async (c: Context) => {

  const monitor = new PerformanceMonitor();

  try {
    const authToken = await authTokenService.getRequiredToken();
    if (!authToken) {
      throw new Error("AUTH_TOKEN is not defined");
    }

    const screenName = c.req.query('screen_name');
    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }

    const checkSearchBan = c.req.query('searchban') === 'true';
    const checkRepost = c.req.query('repost') === 'true';

    const encryptedIp = c.req.query('key');
    const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : '';

    monitor.startOperation('fetchUser');
    const user = await fetchUserByScreenNameAsync(screenName);
    monitor.endOperation('fetchUser');

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
    }

    const service = new ShadowbanHistoryService();

    const sessionId = generateRandomHexString(16);

    if (!user) {
      result = {
        ...result,
        not_found: true,
      };
      await service.createHistory(screenName, result, sessionId);

      return c.json(result)
    }

    if (user.result.__typename !== "User") {
      result = {
        ...result,
        suspend: true,
        user: user.result,
      };
      await service.createHistory(screenName, result, sessionId);

      return c.json(result)
    }

    if (user.result.legacy.protected === true) {
      result = {
        ...result,
        protect: true,
        user: user.result,
      };
      await service.createHistory(screenName, result, sessionId);

      return c.json(result)
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

    const searchSuggestionBanFlag = searchBanFlag || await (async () => {
      const userNameText = user.result.legacy.name;
      monitor.startOperation('fetchSearchSuggestion');
      const searchSuggestionUsers = await fetchSearchSuggestionAsync(screenName, userNameText);
      monitor.endOperation('fetchSearchSuggestion');
      return !searchSuggestionUsers.some(
        (suggestionUser: { screen_name: string }) => suggestionUser.screen_name === userScreenName
      );
    })();

    var checkedTweets = checkSearchBan ? await (async () => {
      try {
        monitor.startOperation('fetchUserId');
        const userId = await fetchUserId(screenName);
        monitor.endOperation('fetchUserId');

        monitor.startOperation('fetchTimelineUrls');
        const tweetInfos = await getTimelineTweetInfo(userId, checkRepost);
        monitor.endOperation('fetchTimelineUrls');

        monitor.startOperation('batchCheckTweets');
        const tweets = await batchCheckTweets(tweetInfos, ip, sessionId, true);
        monitor.endOperation('batchCheckTweets');
        return tweets;
      } catch (error) {
        console.error('Error checking tweets:', error);
        return [];
      }
    })() : undefined;

    const timings = monitor.getTimings();

    result = {
      ...result,
      no_tweet: !user.result.legacy.statuses_count,
      search_ban: searchBanFlag,
      search_suggestion_ban: searchSuggestionBanFlag,
    };
    await service.createHistory(screenName, result, sessionId);

    return c.json({
      ...result,
      user: user.result,
      tweets: checkedTweets,
      _debug: {
        timings
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/searchtimeline', async (c: Context) => {
  try {
    const authToken = await authTokenService.getRequiredToken();
    if (!authToken) {
      throw new Error("AUTH_TOKEN is not defined");
    }

    const screenName = c.req.query('screen_name');

    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }

    const searchData = await fetchSearchTimelineAsync(screenName)
    const searchTimeline = searchData.data?.search_by_raw_query?.search_timeline;
    return c.json({
      searchTimeline
    })
  } catch (error) {
    console.error('Error:', error)
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

app.get('/api/save-auth-token', async (c) => {
  try {
    const authTokenService = new TwitterAuthTokenService();

    // まず既存のトークンを取得
    const currentToken = await authTokenService.getCurrentToken();

    // 新しいトークンを取得
    const newToken = await fetchAuthToken(
      process.env.X_ACCOUNT || '',
      process.env.X_PASSWORD || ''
    );

    // 既存のトークンと新しいトークンが異なる場合のみ更新
    if (!currentToken || currentToken !== newToken) {
      await authTokenService.saveToken(newToken);
    }

    return c.json({
      old_token: currentToken,
      new_token: newToken,
      is_updated: currentToken !== newToken
    });
  } catch (error) {
    console.error('Error fetching auth token:', error);
    return c.json({
      error: 'Failed to fetch auth token',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

//---
//以下テスト用
//---
app.get('/api/user-by-screen-name', async (c) => {
  try {
    const authToken = await authTokenService.getRequiredToken();
    if (!authToken) {
      throw new Error("AUTH_TOKEN is not defined");
    }

    const screenName = c.req.query('screen_name');

    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }

    const response = await fetchUserByScreenNameAsync(screenName);

    if (!response.ok) {
      throw new Error(`Twitter API returned status: ${response.status}`);
    }

    const { data: { user } } = await response.json();
    return c.json({ data: { user } });

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/usertweets', async (c) => {
  try {
    const authToken = await authTokenService.getRequiredToken();
    if (!authToken) {
      throw new Error("AUTH_TOKEN is not defined");
    }

    const screenName = c.req.query('screen_name');

    if (!screenName) {
      throw new Error("SCREEN_NAME is not defined");
    }

    const userId = await fetchUserId(screenName);
    if (!userId) {
      return c.json({ error: 'user_id parameter is required' }, 400);
    }

    const response = await fetchUserTweetsAsync(authToken, userId);

    if (!response.ok) {
      throw new Error(`Twitter API returned status: ${response.status}`);
    }

    const data = await response.json();
    return c.json(data);

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/userreplies', async (c) => {
  try {
    const authToken = await authTokenService.getRequiredToken();
    if (!authToken) {
      throw new Error("AUTH_TOKEN is not defined");
    }
    const csrfToken = generateRandomHexString(16);
    const userId = c.req.query('user_id');
    if (!userId) {
      return c.json({ error: 'user_id parameter is required' }, 400);
    }

    const variables = {
      userId: userId,
      count: 20,
      includePromotedContent: true,
      withCommunity: true,
      withVoice: true,
      withV2Timeline: true
    };

    const features = {
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
    };

    const fieldToggles = {
      withArticlePlainText: false
    };

    const searchParams = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
      fieldToggles: JSON.stringify(fieldToggles)
    });

    const response = await fetch(
      `https://x.com/i/api/graphql/HmWGzuzXoI6uFqqX6QNhEg/UserTweetsAndReplies?${searchParams}`,
      {
        headers: {
          Authorization:
            "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
          Cookie: `auth_token=${authToken}; ct0=${csrfToken}`,
          "X-Csrf-Token": csrfToken,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Twitter API returned status: ${response.status}`);
    }

    const data = await response.json();
    return c.json(data);

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/user-timeline-urls', async (c) => {
  try {
    const screenName = c.req.query('screen_name');
    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }
    const checkRepost = (c.req.query('repost') ?? 'true') === 'true';

    // 認証トークンの確認
    const userId = await fetchUserId(screenName)

    if (!userId) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Extract URLs from timeline data
    const urls = await getTimelineTweetInfo(userId, checkRepost);

    return c.json({ urls });

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/tweet-detail', async (c) => {
  try {
    const authToken = await authTokenService.getRequiredToken();
    if (!authToken) {
      throw new Error("AUTH_TOKEN is not defined");
    }

    const tweetId = c.req.query('tweet_id');
    if (!tweetId) {
      return c.json({ error: 'tweet_id parameter is required' }, 400);
    }

    const csrfToken = generateRandomHexString(16);

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

    const response = await fetch(
      `https://x.com/i/api/graphql/nBS-WpgA6ZG0CyNHD517JQ/TweetDetail?${searchParams}`,
      {
        headers: {
          Authorization: "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
          Cookie: `auth_token=${authToken}; ct0=${csrfToken}`,
          "X-Csrf-Token": csrfToken,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Twitter API returned status: ${response.status}`);
    }

    const data = await response.json();
    return c.json(data);

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/fetch-auth-token', async (c) => {
  try {
    const token = await fetchAuthToken(
      process.env.X_ACCOUNT || '',
      process.env.X_PASSWORD || ''
    );
    return c.json({ token });
  } catch (error) {
    console.error('Error fetching auth token:', error);
    return c.json({
      error: 'Failed to fetch auth token',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

const port = 3001
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
