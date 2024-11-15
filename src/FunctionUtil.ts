
export function generateRandomHexString(length: number) {
    let result = "";
    const characters = "0123456789abcdef";
    for (let i = 0; i < length * 2; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}


// URLリストを抽出する関数
interface Tweet {
    sortIndex: string;
    content: {
        itemContent: {
            tweet_results: {
                result: {
                    rest_id: string;
                    core: {
                        user_results: {
                            result: {
                                legacy: {
                                    screen_name: string;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

export function extractTweetUrls(data: any): string[] {
    console.log(data?.data?.user?.result?.timeline_v2?.timeline?.instructions?.[2].entries)
    try {
        const entries = data?.data?.user?.result?.timeline_v2?.timeline?.instructions?.[2]?.entries || [];
        const urls: string[] = [];
        console.log(entries.length)
        for (const entry of entries) {
            // TimelineTimelineItemのエントリーのみを処理
            if (entry?.content?.entryType === "TimelineTimelineItem") {
                const tweet = entry as Tweet;
                const tweetResult = tweet?.content?.itemContent?.tweet_results?.result;
                if (tweetResult) {
                    const screenName = tweetResult.core.user_results.result.legacy.screen_name;
                    const tweetId = tweetResult.rest_id;
                    const url = `https://x.com/${screenName}/status/${tweetId}`;
                    urls.push(url);
                }
            }
        }

        return urls;
    } catch (error) {
        console.error('Error extracting URLs:', error);
        return [];
    }
}
