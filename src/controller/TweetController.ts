import { Context } from 'hono';
import { tweetService } from '../service/TweetService';
import { authTokenService } from '../service/TwitterAuthTokenService';
import { Log } from '../util/Log';
import { respondWithDetailedError } from '../util/Response';

export class TweetController {
    static async createTweet(c: Context) {
        try {
            const body = await c.req.json();
            const tweetText = body.tweet_text;
            const accountId = body.account_id;

            if (!tweetText) {
                return c.json({ error: 'tweet_text parameter is required' }, 400);
            }

            if (!accountId) {
                return c.json({ error: 'account_id parameter is required' }, 400);
            }

            if (typeof tweetText !== 'string') {
                return c.json({ error: 'tweet_text must be a string' }, 400);
            }

            if (typeof accountId !== 'string') {
                return c.json({ error: 'account_id must be a string' }, 400);
            }

            if (tweetText.length > 280) {
                return c.json({ error: 'Tweet text exceeds 280 characters' }, 400);
            }

            const authTokenSet = await authTokenService.getTokenByAccountId(accountId);
            if (!authTokenSet) {
                return c.json({ error: `Auth token not found for account: ${accountId}` }, 404);
            }

            const result = await tweetService.createTweet(tweetText, authTokenSet);

            return c.json({
                success: true,
                data: result
            });

        } catch (error) {
            Log.error('Error creating tweet:', error);
            return respondWithDetailedError(c, error as Error, 9999, 500);
        }
    }
}