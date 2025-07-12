import { Context } from 'hono';
import { authTokenService } from '../service/TwitterAuthTokenService';
import { Log } from '../util/Log';
import { respondWithDetailedError } from '../util/Response';

export class AuthTokenController {
    /**
     * アカウントIDに基づいてトークンを削除
     */
    static async deleteTokenByAccountId(c: Context) {
        try {
            const accountId = c.req.query('screen_name');

            if (!accountId) {
                return respondWithDetailedError(c, new Error('accountId query parameter is required'), 4001, 400);
            }

            const deletedToken = await authTokenService.deleteTokenByAccountId(accountId);

            if (!deletedToken) {
                return respondWithDetailedError(c, new Error('Token not found'), 4002, 404);
            }

            return c.json({
                success: true,
                message: `Token for account ${accountId} deleted successfully`,
                deletedAccount: deletedToken.accountId
            });
        } catch (error) {
            Log.error('Error deleting token by account ID:', error);
            return respondWithDetailedError(c, error as Error, 4003, 500);
        }
    }
}