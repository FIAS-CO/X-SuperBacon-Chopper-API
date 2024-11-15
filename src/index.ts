import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import { fetchWithRedirects, isAuthenticationPage, extractUrlsFromHtml, checkTweetStatus } from './TwitterUtil/TwitterUtil'
import prisma from './db'
import { expandUrl } from './UrlUtil'

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
  ip: string
) {
  return await prisma.twitterCheck.create({
    data: {
      username: username,
      url: url,
      result: result,
      ip: ip
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

// 利用可能性をチェックするAPIエンドポイント
app.get('/api/check', async (c: Context) => {
  try {
    const inputUrl = c.req.query('url')
    if (!inputUrl) {
      return c.json({ error: 'URL parameter is required' }, 400)
    }

    const targetUrl = inputUrl.includes('t.co')
      ? await expandUrl(inputUrl)
      : inputUrl

    const statusResult = await checkTweetStatus(targetUrl, true)
    createCheckHistory(
      getUserName(targetUrl), inputUrl, statusResult.status, ''
    )

    return c.json(statusResult, statusResult.code)

  } catch (error) {
    console.error('Error:', error)
    return c.json({
      code: 500,
      status: 'UNKNOWN',
      message: 'Internal server error'
    }, 500)
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
    const historyWithJST = history.map(record => {
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

const port = 3001
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
