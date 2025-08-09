import { createTweetAsync } from '../TwitterUtil/TwitterUtil';
import { AuthTokenSet } from '../types/Types';

export class TweetService {
    async createTweet(tweetText: string, authTokenSet: AuthTokenSet): Promise<any> {
        return await createTweetAsync(tweetText, authTokenSet);
    }
}

export const tweetService = new TweetService();