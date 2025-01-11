import cron from 'node-cron';
import { authTokenService } from './TwitterAuthTokenService';
import { fetchAuthToken } from '../TwitterUtil/TwitterAuthUtil';

export class TokenRefreshCronService {
    // 毎日0時に実行
    private static readonly DAILY_SCHEDULE = '0 0 * * *';

    static startTokenRefreshCron() {
        console.log('Starting auth token refresh cron job...');

        // 毎時実行のジョブを登録
        cron.schedule(this.DAILY_SCHEDULE, async () => {
            try {
                console.log('Running auth token refresh job...');

                // 現在のトークンを取得
                const currentToken = await authTokenService.getCurrentToken();

                // 新しいトークンを取得
                const newToken = await fetchAuthToken(
                    process.env.X_ACCOUNT || '',
                    process.env.X_PASSWORD || ''
                );

                // トークンが異なる場合のみ更新
                if (!currentToken || currentToken !== newToken) {
                    await authTokenService.saveToken(newToken);
                    console.log('Auth token updated successfully');
                } else {
                    console.log('Auth token is still valid, no update needed');
                }
            } catch (error) {
                console.error('Error in auth token refresh job:', error);
            }
        });
    }

    static stopAllCronJobs() {
        cron.getTasks().forEach(task => task.stop());
        console.log('All cron jobs stopped');
    }
}