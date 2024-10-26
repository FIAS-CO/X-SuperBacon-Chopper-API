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
