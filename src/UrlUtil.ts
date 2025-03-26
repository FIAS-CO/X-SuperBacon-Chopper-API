
// t.co URLを展開する関数
export async function expandUrl(shortUrl: string): Promise<string> {
    try {
        // t.coを含まない場合は直接元のURLを返す
        // if (!shortUrl.includes('t.co')) {
        //     return shortUrl;
        // }

        const response = await fetch(shortUrl, {
            method: 'HEAD',
            redirect: 'follow'
        })
        return response.url
    } catch (error) {
        console.error(`URL expansion error for ${shortUrl}:`, error)
        return shortUrl
    }
}