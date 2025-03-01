// 例: formatJSTDateTime を DateUtil クラスとして作成
export class DateUtil {
    /**
     * 日付を日本時間のフォーマットに変換する
     * @param date フォーマットする日付
     * @param includeTime 時間も含めるかどうか (デフォルト: true)
     * @returns フォーマットされた日本時間の文字列
     */
    static formatJST(date: Date, includeTime: boolean = true): string {
        const options: Intl.DateTimeFormatOptions = {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };

        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
            options.second = '2-digit';
        }

        return date.toLocaleString('ja-JP', options) + (includeTime ? ' JST' : '');
    }
}