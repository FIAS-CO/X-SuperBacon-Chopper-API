export const ErrorCodes = {
    MISSING_SCREEN_NAME: 1001,
    MISSING_TURNSTILE_TOKEN: 1002,
    INVALID_TURNSTILE_TOKEN: 1003,
    INVALID_IP_FORMAT: 1004,
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];