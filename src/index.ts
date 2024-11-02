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

// HTMLからリダイレクトURLを抽出する関数
function extractRedirectUrl(html: string): string | null {
  // meta refresh タグからURLを抽出
  const metaRefreshMatch = html.match(/<meta\s+http-equiv="refresh"\s+content="0;\s*url\s*=\s*([^"]+)"/i)
  if (metaRefreshMatch) {
    return metaRefreshMatch[1].trim()
  }

  // JavaScript location リダイレクトからURLを抽出
  const jsLocationMatch = html.match(/document\.location\s*=\s*"([^"]+)"/i)
  if (jsLocationMatch) {
    return jsLocationMatch[1].trim()
  }

  return null
}

// URLから直接コンテンツを取得する関数（リダイレクト対応）
async function fetchUrlContent(url: string, maxRedirects: number = 5) {
  let currentUrl = url
  let redirectCount = 0
  const cookies = new Map<string, string>()

  while (redirectCount < maxRedirects) {
    try {
      const response = await fetch(currentUrl, {
        headers: {
          ...EDGE_HEADERS,
          ...(cookies.size > 0 ? {
            'Cookie': Array.from(cookies.entries())
              .map(([name, value]) => `${name}=${value}`)
              .join('; ')
          } : {})
        }
      })

      // Set-Cookieヘッダーの処理
      const setCookie = response.headers.get('set-cookie')
      if (setCookie) {
        setCookie.split(',').forEach(cookieStr => {
          const [nameValue] = cookieStr.split(';')
          const [name, value] = nameValue.split('=').map(s => s.trim())
          if (name && value) {
            cookies.set(name, value)
          }
        })
      }

      const contentType = response.headers.get('content-type') || ''
      const content = await response.text()

      // HTTP リダイレクトの処理
      if (response.redirected) {
        currentUrl = response.url
        redirectCount++
        continue
      }

      // HTML内のリダイレクトの処理
      if (contentType.includes('text/html')) {
        const redirectUrl = extractRedirectUrl(content)
        if (redirectUrl) {
          currentUrl = new URL(redirectUrl, currentUrl).toString()
          redirectCount++
          console.log(`Following redirect to: ${currentUrl}`)
          continue
        }
      }

      return {
        content,
        contentType,
        status: response.status,
        statusText: response.statusText,
        finalUrl: currentUrl
      }

    } catch (error) {
      throw new Error(`Failed to fetch content at ${currentUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  throw new Error('Max redirects exceeded')
}

// 新しいAPIエンドポイント
app.get('/api/fetch-content', async (c: Context) => {
  try {
    const targetUrl = c.req.query('url')

    if (!targetUrl) {
      return c.json({
        error: 'URL parameter is required'
      }, 400)
    }

    const result = await fetchUrlContent(targetUrl)

    return c.json({
      url: targetUrl,
      finalUrl: result.finalUrl,
      content: result.content,
      contentType: result.contentType,
      status: result.status,
      statusText: result.statusText
    })

  } catch (error) {
    console.error('Error fetching content:', error)
    return c.json({
      error: 'Failed to fetch content',
      details: error instanceof Error ? error.message : 'Unknown error',
      url: c.req.query('url')
    }, 500)
  }
})

const port = 3001
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
