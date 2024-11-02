
// t.co URLを展開する関数
export async function expandUrl(shortUrl: string): Promise<string> {
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