import { MiddlewareHandler } from 'hono'
import { aegisMonitorService } from '../service/AegisMonitorService'

export const aegisMonitor: MiddlewareHandler = async (_c, next) => {
    aegisMonitorService.recordAccess()
    await next()
}