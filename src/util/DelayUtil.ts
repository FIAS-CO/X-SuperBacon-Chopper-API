export class DelayUtil {
    /**
     * 指定された範囲内でランダムな秒数だけ待機する
     * @param minSeconds 最小待機秒数
     * @param maxSeconds 最大待機秒数
     * @returns Promise<void>
     */
    static async randomDelay(minSeconds = 3, maxSeconds = 7): Promise<void> {
        const delayMs = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
        return new Promise(resolve => setTimeout(resolve, delayMs));
    }
}