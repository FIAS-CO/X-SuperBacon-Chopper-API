import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import { fetchWithRedirects, isAuthenticationPage, extractUrlsFromHtml, checkTweetStatus } from './TwitterUtil/TwitterUtil'
import prisma from './db'
import { expandUrl } from './UrlUtil'
import { generateRandomHexString, getTimelineUrls } from './FunctionUtil'
import { serverDecryption } from './util/ServerDecryption'

// 環境変数の型定義
type Bindings = {
  // 必要に応じて環境変数の型を追加
}

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
  console.log("aaaaaa")
  console.log(response)
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

async function createCheckHistory(
  username: string,
  url: string,
  result: string,
  ip: string,
  sessionId: string
) {
  return await prisma.twitterCheck.create({
    data: {
      username: username,
      url: url,
      result: result,
      ip: ip,
      sessionId: sessionId
    }
  })
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
    const results = await Promise.all(
      urls.map(async (inputUrl) => {
        try {
          if (!inputUrl) {
            return {
              code: 400,
              status: 'INVALID_URL' as const,
              message: 'URL parameter is required'
            };
          }

          // URLを展開（t.coの場合のみ）
          const targetUrl = inputUrl.includes('t.co')
            ? await expandUrl(inputUrl)
            : inputUrl;

          const statusResult = await checkTweetStatus(targetUrl, true);

          // チェック履歴を作成（非同期でバックグラウンド処理）
          createCheckHistory(
            getUserName(targetUrl),
            inputUrl,
            statusResult.status,
            ip || '',
            sessionId
          ).catch(error => {
            console.error('Error creating check history:', error);
          });

          return {
            url: inputUrl,
            ...statusResult
          };
        } catch (error) {
          console.error('Error checking URL:', inputUrl, error);
          return {
            url: inputUrl,
            code: 500,
            status: 'UNKNOWN' as const,
            message: 'Internal server error'
          };
        }
      })
    );

    return c.json(results);

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
})

// 利用可能性をチェックするAPIエンドポイント
app.get('/api/get-history-2n7b4x9k5m1p3v8h6j4w', async (c: Context) => {
  try {
    const history = await prisma.twitterCheck.findMany({
      orderBy: {
        id: 'desc',
      }
    })

    // UTCから日本時間に変換
    const historyWithJST = history.map(({ tweetDate, ...record }) => {
      const date = new Date(record.date)
      return {
        ...record,
        date: date.toLocaleString('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }) + ' JST'
      }
    })

    return c.json(historyWithJST)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Failed to fetch users' }, 500)
  }
})

app.get('/api/extract-urls', async (c) => {
  try {
    const targetUrl = c.req.query('url')

    if (!targetUrl) {
      return c.json({ error: 'URL parameter is required' }, 400)
    }

    console.log('Fetching URL:', targetUrl)

    // HTMLの取得（リダイレクトに対応）
    const { html, finalUrl } = await fetchWithRedirects(targetUrl)

    // リダイレクトページかどうかのチェック
    if (isAuthenticationPage(html)) {
      return c.json({
        error: 'Authentication required',
        message: 'This URL requires authentication or has been redirected to a login page',
        source_url: targetUrl,
        final_url: finalUrl,
        html_preview: html.substring(0, 200) // デバッグ用にプレビューを含める
      }, 403)
    }

    const urls = extractUrlsFromHtml(html)
    return c.json({
      source_url: targetUrl,
      final_url: finalUrl,
      extracted_urls: urls,
      count: urls.length,
      html_preview: html.substring(0, 200) // デバッグ用にプレビューを含める
    })

  } catch (error) {
    console.error('Error:', error)
    return c.json({
      error: 'Failed to extract URLs',
      details: error instanceof Error ? error.message : 'Unknown error',
      source_url: c.req.query('url')
    }, 500)
  }
})

app.get('/api/usertest', async (c) => {
  try {
    const authToken = process.env.AUTH_TOKEN;
    if (!authToken) {
      throw new Error("AUTH_TOKEN is not defined");
    }

    const csrfToken = generateRandomHexString(16);
    const screenName = c.req.query('screen_name');

    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }

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
    });

    const response = await fetch(
      `https://api.twitter.com/graphql/k5XapwcSikNsEsILW5FvgA/UserByScreenName?${searchParams}`,
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
    const authToken = process.env.AUTH_TOKEN;
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
      count: 40,
      includePromotedContent: true,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice: true,
      withV2Timeline: true
    };

    const features = {
      responsive_web_live_screen_enabled: false,
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
      `https://x.com/i/api/graphql/F_gCJRQooCZ0T74rGl4q9Q/UserTweets?${searchParams}`,
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

app.get('/api/userreplies', async (c) => {
  try {
    const authToken = process.env.AUTH_TOKEN;
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
    // 認証トークンの確認
    const authToken = process.env.AUTH_TOKEN;
    if (!authToken) {
      throw new Error("AUTH_TOKEN is not defined");
    }

    const screenName = c.req.query('screen_name');
    if (!screenName) {
      return c.json({ error: 'screen_name parameter is required' }, 400);
    }

    // CSRFトークンの生成
    const csrfToken = generateRandomHexString(16);

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
    });

    const headers = {
      Authorization: "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
      Cookie: `auth_token=${authToken}; ct0=${csrfToken}`,
      "X-Csrf-Token": csrfToken,
    };

    const userResponse = await fetch(
      `https://api.twitter.com/graphql/k5XapwcSikNsEsILW5FvgA/UserByScreenName?${searchParams}`,
      { headers }
    );

    if (!userResponse.ok) {
      throw new Error(`Twitter API returned status: ${userResponse.status}`);
    }

    const { data: { user } } = await userResponse.json();
    const userId = user?.result?.rest_id;

    if (!userId) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Extract URLs from timeline data
    const urls = await getTimelineUrls(authToken, userId);

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
    const authToken = process.env.AUTH_TOKEN;
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

const port = 3001
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
