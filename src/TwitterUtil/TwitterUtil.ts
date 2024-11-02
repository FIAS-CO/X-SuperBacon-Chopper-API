import { StatusCode } from "hono/utils/http-status";
import { expandUrl } from "../UrlUtil";

type TweetStatus = {
    code: StatusCode;
    status: 'AVAILABLE' | 'FORBIDDEN' | 'NOT_FOUND' | 'UNKNOWN' | 'INVALID_URL' | 'QUATE_FORBIDDEN';
    message: string;
    oembedData?: any;
};

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
