import { Log } from '../util/Log'
import { systemSettingService } from './SystemSettingService'
import { SystemSettingsUtil } from '../util/SystemSettingsUtil'

const THRESHOLD = 500
const INTERVAL_MS = 30 * 60 * 1000 // 30分

class AegisMonitorService {
    private accessLog: number[] = []
    private triggered = false

    public recordAccess(): void {
        const now = Date.now()
        this.accessLog = this.accessLog.filter(ts => now - ts <= INTERVAL_MS)
        this.accessLog.push(now)

        if (this.accessLog.length > THRESHOLD && !this.triggered) {
            this.triggered = true
            this.triggerAction()

            setTimeout(() => {
                this.triggered = false
            }, INTERVAL_MS)
        }
    }

    public isAccessThresholdExceeded(): boolean {
        return this.accessLog.length > THRESHOLD
    }

    private async triggerAction(): Promise<void> {
        Log.error('⚠️ 30分で500アクセス超えました！Aegisによりアクセス制限を行います。')

        const updatedSettings = await systemSettingService.enableBlackAndWithitelist()
        await SystemSettingsUtil.notifyAegisTriggeredByAccessSpike()
        await SystemSettingsUtil.notifyAccessSettingsChange(updatedSettings)
    }
}

export const aegisMonitorService = new AegisMonitorService()