export interface Timing {
    operation: string;
    startTime: number;
    duration?: number;
}

export class PerformanceMonitor {
    private timings: Timing[] = [];
    private readonly startTime: number;

    constructor() {
        this.startTime = Date.now();
    }

    startOperation(operation: string): void {
        this.timings.push({
            operation,
            startTime: Date.now()
        });
    }

    endOperation(operation: string): void {
        const timing = this.timings.find(t => t.operation === operation && !t.duration);
        if (timing) {
            timing.duration = Date.now() - timing.startTime;
            // console.log(`${operation} took ${timing.duration}ms`);
        }
    }

    getTimings(): Record<string, number> {
        const result: Record<string, number> = {};
        this.timings.forEach(timing => {
            if (timing.duration) {
                result[timing.operation] = timing.duration;
            }
        });
        result.totalTime = Date.now() - this.startTime;
        // console.log('Total processing time:', result.totalTime, 'ms');
        // console.log('Timing breakdown:', result);
        return result;
    }
}
