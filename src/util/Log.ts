export class Log {
    private static getJSTTimestamp(): string {
        return new Date().toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    static info(message: string, ...args: any[]): void {
        console.log(`[${this.getJSTTimestamp()}] [INFO] ${message}`, ...args);
    }

    static error(message: string, ...args: any[]): void {
        console.error(`[${this.getJSTTimestamp()}] [ERROR] ${message}`, ...args);
    }

    static warn(message: string, ...args: any[]): void {
        console.warn(`[${this.getJSTTimestamp()}] [WARN] ${message}`, ...args);
    }

    static debug(message: string, ...args: any[]): void {
        if (this.isDev()) {
            console.debug(`[${this.getJSTTimestamp()}] [DEBUG] ${message}`, ...args);
        }
    }

    static trace(message: string, ...args: any[]): void {
        if (this.isDev()) {
            console.trace(`[${this.getJSTTimestamp()}] [TRACE] ${message}`, ...args);
        }
    }

    static object(label: string, obj: any): void {
        console.log(`[${this.getJSTTimestamp()}] [INFO] ${label}:`,
            JSON.stringify(obj, null, 2));
    }

    private static isDev(): boolean {
        return process.env.NODE_ENV === 'development';
    }
}