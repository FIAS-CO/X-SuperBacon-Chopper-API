import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import { fetchWithRedirects, isAuthenticationPage, extractUrlsFromHtml } from './TwitterUtil/TwitterUtil'

// 環境変数の型定義
type Bindings = {
  // 必要に応じて環境変数の型を追加
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/*', cors())

// Health check endpoint
app.get('/', (c: Context) => c.json({ status: 'ok' }))

// t.co URLを展開する関数
async function expandUrl(shortUrl: string): Promise<string> {
  try {
    const response = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'follow'
    })
    return response.url
  } catch (error) {
    console.error('URL expansion error:', error)
    return shortUrl
  }
}

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

// 利用可能性をチェックするAPIエンドポイント
app.get('/api/check', async (c: Context) => {
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

    // エラーメッセージの確認
    const errorText = "Sorry, you are not authorized to see this status."
    const containsError = JSON.stringify(data).toLowerCase().includes(errorText.toLowerCase())

    return c.json({ isUnavailable: containsError, oembedData: data })

  } catch (error) {
    console.error('Error:', error)
    return c.json({ error: 'Internal server error' }, 500)
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
