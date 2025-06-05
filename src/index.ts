import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import {
  fetchUserByScreenNameAsync, fetchSearchTimelineAsync,
  fetchUserTweetsAsync,
  getTimelineTweetInfo,
  batchCheckTweetUrls,
  fetchSearchSuggestionAsync,
  getTransactionIdAsync,
  fetchUserByScreenNameTestAsync,
  fetchUserByScreenNameAsHtmlAsync
} from './TwitterUtil/TwitterUtil'
import prisma from './db'
import { expandUrl } from './UrlUtil'
import { generateRandomHexString } from './FunctionUtil'
import { serverDecryption } from './util/ServerDecryption'
import { CheckHistoryService } from './service/CheckHistoryService'
import { authTokenService } from './service/TwitterAuthTokenService'
import { Log } from './util/Log'
import { discordNotifyService } from './service/DiscordNotifyService'
import { ShadowBanCheckController } from './controller/ShadowBanCheckController'
import { rateLimit } from './middleware/RateLimit'
import { IpAccessControlController } from './controller/IpAccessControlController'
import { SystemSettingController } from './controller/SystemSettingController'
import { aegisMonitor } from './middleware/AegisMonitor'
import { checkByUserParamExists } from './middleware/CheckByUserParamExists'
import { PowService } from './service/PowService'
import { pow } from './middleware/ProofOfWork'
import { verifyIpAccess } from './middleware/VerifyIpAccess'
import { accessLogger } from './middleware/AccessLogger'
import { verifyReferer } from './middleware/VerifyReferer'
import { ApiAccessLogController } from './controller/ApiAccessLogController'
import { requestParser } from './middleware/RequestParser'

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
    Log.error('/api/oembedのError:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

app.post('/api/check-batch', async (c: Context) => {
  try {
    const body = await c.req.json();
    const urls: string[] = body.urls;
    const encryptedIp = body.key; // ユーザーにバレないよう偽装
    const ip = encryptedIp ? await serverDecryption.decrypt(encryptedIp) : '';

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
    Log.error('/api/check-batchのError:', error);
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
    Log.error("get-historyのエラー", error)
    return c.json({ error: 'Failed to fetch users' }, 500)
  }
})

app.get('/api/get-history-500-2n7b4x9k5m1p3v8h6j4w', async (c: Context) => {
  try {
    const history = await prisma.twitterCheck.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 500 // Limit to 500 records
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
    Log.error("get-history-500のエラー", error)
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
    Log.error("get-history-shadowbanのエラー", error)
    return c.json({ error: 'Failed to fetch users' }, 500)
  }
})

app.get('/api/get-history-500-shadowban-8f4k9p2m7n3x6v1q5w8d', async (c: Context) => {
  try {
    const history = await prisma.shadowBanCheck.findMany({
      orderBy: {
        id: 'desc',
      },
      take: 500 // Limit to 500 records
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
    Log.error("get-history-shadowban-500のエラー", error)
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
    Log.error("get-history-by-session-idのエラー", error)
    return c.json({ error: 'Failed to fetch users' }, 500)
  }
})

app.post('/api/check-by-user', requestParser, accessLogger, aegisMonitor, checkByUserParamExists, verifyIpAccess, rateLimit, pow, verifyReferer, ShadowBanCheckController.checkByUser);
app.post('/api/check-by-user-inner', requestParser, accessLogger, ShadowBanCheckController.checkByUserInner);

app.get('/api/searchtimeline', async (c: Context) => {
  try {
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
    Log.error('searchtimelineのError:', error)
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// 認証トークン保存エンドポイントを更新
app.get('/api/save-auth-token', async (c) => {
  try {
    const newToken = c.req.query('token');
    const newCsrfToken = c.req.query('ct0');
    const accountId = c.req.query('account_id');

    if (!newToken || !newCsrfToken || !accountId) {
      return c.json({ error: 'token parameters (token, ct0, account_id) are required' }, 400);
    }

    // まず既存のトークンを取得
    const currentTokenSet = await authTokenService.getTokenByAccountId(accountId);
    const currentToken = currentTokenSet?.token ?? "NO_DATA";
    const currentCsrfToken = currentTokenSet?.csrfToken ?? "NO_DATA";

    // 既存のトークンと新しいトークンが異なる場合のみ更新
    if (currentToken !== newToken || currentCsrfToken !== newCsrfToken) {
      await authTokenService.saveToken(newToken, newCsrfToken, accountId);
    }

    const isUpdated = currentToken !== newToken || currentCsrfToken !== newCsrfToken;
    discordNotifyService.notifyAuthTokenRefresh(
      accountId,
      currentToken,
      newToken,
      currentCsrfToken,
      newCsrfToken,
      isUpdated
    );
    return c.json({
      account: accountId,
      old_token: currentTokenSet,
      new_token: newToken,
      old_csrf_token: currentCsrfToken,
      csrf_token: newCsrfToken,
      is_updated: isUpdated
    });
  } catch (error) {
    Log.error('Error saving auth token:', error);
    return c.json({
      error: 'Failed to save auth token',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// 全トークン情報の取得エンドポイント
app.get('/api/get-auth-tokens', async (c) => {
  try {
    const tokens = await authTokenService.getAllTokens();

    // レスポンスのためにトークンを整形（機密情報を部分的に隠す）
    const safeTokens = tokens.map(token => ({
      id: token.id,
      accountId: token.accountId,
      token: token.token,
      csrfToken: token.csrfToken,
      lastUsed: token.lastUsed,
      resetTime: token.resetTime,
      updatedAt: token.updatedAt
    }));

    return c.json(safeTokens);
  } catch (error) {
    Log.error('Error fetching auth tokens:', error);
    return c.json({
      error: 'Failed to fetch auth tokens',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/ip-access-control/blacklist', IpAccessControlController.getBlacklist);
app.get('/api/ip-access-control/whitelist', IpAccessControlController.getWhitelist);
app.post('/api/ip-access-control/blacklist', IpAccessControlController.replaceBlacklist);
app.post('/api/ip-access-control/whitelist', IpAccessControlController.replaceWhitelist);

app.post('/api/ip-access-control/add-blacklist', IpAccessControlController.addBlacklist);
app.post('/api/ip-access-control/add-whitelist', IpAccessControlController.addWhitelist);

app.delete('/api/ip-access-control/delete-blacklist', IpAccessControlController.deleteBlacklist);
app.delete('/api/ip-access-control/delete-whitelist', IpAccessControlController.deleteWhitelist);

app.get('/api/system-control/get-settings', SystemSettingController.getSystemSettings);

app.get('/api/system-control/enable-blacklist', SystemSettingController.enableBlacklist);
app.get('/api/system-control/disable-blacklist', SystemSettingController.disableBlacklist);
app.get('/api/system-control/enable-whitelist', SystemSettingController.enableWhitelist);
app.get('/api/system-control/disable-whitelist', SystemSettingController.disableWhitelist);

app.get('/api/system-control/enable-aegis', SystemSettingController.enableAegis);
app.get('/api/system-control/disable-aegis', SystemSettingController.disableAegis);

app.get('/api/system-control/get-access-log', ApiAccessLogController.getLogs);

app.post('/api/generate-keyvalue', requestParser, accessLogger, checkByUserParamExists, rateLimit, verifyIpAccess, verifyReferer, async (c) => {
  const data = PowService.generateChallenge()
  return c.json(data)
})

//---
//以下テスト用
//---
app.get('/api/user-by-screen-name', async (c) => {
  try {
    const screenName = c.req.query('screen_name');

    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }

    const json = await fetchUserByScreenNameAsync(screenName);

    return c.json(json);

  } catch (error) {
    Log.error('/api/user-by-screen-name Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/user-by-screen-name2', async (c) => {
  try {
    const screenName = c.req.query('screen_name');
    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }

    // 1回だけアクセスしてレスポンスを取得
    const responseText = await fetchUserByScreenNameAsHtmlAsync(screenName);

    // HTMLかどうかを判定
    if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
      // HTMLの場合はそのまま返す
      return new Response(responseText, {
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
        },
      });
    }

    // JSONの場合はパースして返す
    try {
      const jsonData = JSON.parse(responseText);
      const user = jsonData.data?.user;
      return c.json(user);
    } catch (parseError) {
      Log.error('Failed to parse response as JSON:', parseError);
      return c.json({
        error: 'Invalid response format',
        details: 'Response is neither valid HTML nor JSON'
      }, 500);
    }

  } catch (error) {
    Log.error('/api/user-by-screen-name Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/user-by-screen-name-test', async (c) => {
  try {
    const screenName = c.req.query('screen_name');

    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }

    const json = await fetchUserByScreenNameTestAsync(screenName);

    return c.json(json);

  } catch (error) {
    Log.error('/api/user-by-screen-name-test Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/search-suggestion', async (c) => {
  try {
    const screenName = c.req.query('screen_name');

    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }

    const json = await fetchSearchSuggestionAsync(screenName, "");

    return c.json(json);

  } catch (error) {
    Log.error('/api/user-by-screen-name Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/user-id', async (c) => {
  try {
    const screenName = c.req.query('screen_name');

    if (!screenName) {
      throw new Error("SCREEN_NAME is not defined");
    }

    const userId = (await fetchUserByScreenNameAsync(screenName)).result?.rest_id;
    if (!userId) {
      return c.json({ error: 'user_id parameter is required' }, 400);
    }
    return c.json(userId);

  } catch (error) {
    Log.error('/api/user-id Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/usertweets', async (c) => {
  try {
    const authTokenSet = await authTokenService.getRequiredTokenSet();
    if (!authTokenSet) {
      throw new Error("AUTH_TOKEN is not defined");
    }

    const screenName = c.req.query('screen_name');

    if (!screenName) {
      throw new Error("SCREEN_NAME is not defined");
    }

    const userId = (await fetchUserByScreenNameAsync(screenName)).result?.rest_id;
    if (!userId) {
      return c.json({ error: 'user_id parameter is required' }, 400);
    }

    const response = await fetchUserTweetsAsync(authTokenSet, userId);

    if (!response.ok) {
      throw new Error(`Twitter API returned status: ${response.status}`);
    }

    const data = await response.json();
    return c.json(data);

  } catch (error) {
    Log.error('/api/usertweets Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/userreplies', async (c) => {
  try {
    const authTokenSet = await authTokenService.getRequiredTokenSet();
    if (!authTokenSet) {
      throw new Error("AUTH_TOKEN is not defined");
    }
    const authToken = authTokenSet.token;
    const csrfToken = authTokenSet.csrfToken;
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
    Log.error('/api/userreplies Error:', error);
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
    const userId = (await fetchUserByScreenNameAsync(screenName)).result?.rest_id;

    if (!userId) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Extract URLs from timeline data
    const urls = await getTimelineTweetInfo(userId, checkRepost);

    return c.json({ urls });

  } catch (error) {
    Log.error('/api/user-timeline-urls Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/tweet-detail', async (c) => {
  try {
    const authTokenSet = await authTokenService.getRequiredTokenSet();
    if (!authTokenSet) {
      throw new Error("AUTH_TOKEN is not defined");
    }

    const tweetId = c.req.query('tweet_id');
    if (!tweetId) {
      return c.json({ error: 'tweet_id parameter is required' }, 400);
    }

    const authToken = authTokenSet.token;
    const csrfToken = authTokenSet.csrfToken;

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
    Log.error('/api/tweet-detail Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/auth-token-info', async (c) => {
  try {
    const entry = await prisma.twitterAuthToken.findUnique({
      where: {
        id: 1
      }
    });

    if (!entry) {
      return c.json({ error: 'Token not found' }, 404);
    }

    return c.json({
      id: entry.id,
      token: entry.token,
      updatedAt: entry.updatedAt
    });
  } catch (error) {
    Log.error('Error fetching auth token info:', error);
    return c.json({
      error: 'Failed to fetch auth token info',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/decrypt-ip', async (c: Context) => {
  try {
    Log.info('Test decrypt IP request received');
    const encryptedIp = c.req.query('key'); // クエリパラメータから取得
    const ip = encryptedIp ? await serverDecryption.decrypt(encryptedIp) : '';

    return c.json({
      encryptedIp: encryptedIp,
      ip: ip
    });
  } catch (error) {
    return c.json({
      error: 'Failed to decrypt ip',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/encrypt-ip', async (c: Context) => {
  try {
    const ip = c.req.query('ip'); // クエリパラメータから取得
    if (!ip) {
      return c.json({ error: 'IP parameter is required' }, 400);
    }

    const encryptedIp = await serverDecryption.encrypt(ip);
    const decryptedIp = await serverDecryption.decrypt(encryptedIp);

    return c.json({
      ip: ip,
      encryptedIp: encryptedIp,
      decryptedIp: decryptedIp,
      correctlyDecrypted: ip === decryptedIp
    });
  } catch (error) {
    return c.json({
      error: 'Failed to encrypt ip',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/testtest', async (c: Context) => {
  try {
    const token = "cda2385aed36d2fbb9985586c290c7434df3ed07";
    authTokenService.updateTokenResetTime(token, 111)

    return c.json({
      test: "test"
    });
  } catch (error) {
    return c.json({
      error: 'Failed to decrypt ip',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.get('/api/check-heap-size', async (c: Context) => {
  const v8 = require('v8');

  const heapStats = v8.getHeapStatistics();
  const heapSizeLimit = (heapStats.heap_size_limit / 1024 / 1024).toFixed(2);
  const usedHeapSize = (heapStats.used_heap_size / 1024 / 1024).toFixed(2);

  return c.json({
    HeapSizeLimit: `${heapSizeLimit} MB`,
    UsedHeapSize: `${usedHeapSize} MB`,
  });
});

// app.get('/api/check-by-user-inner-asdafdasdfadsfa', ShadowBanCheckController.checkByUserInner);

app.get('/api/create-transaction-id', async (c: Context) => {
  return c.json({
    transactionId: await getTransactionIdAsync("GET", "/i/api/graphql/SV5-ri_UzGD2iatzT24u5A/SearchTimeline")
  })
});

const port = 3001
Log.info(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
