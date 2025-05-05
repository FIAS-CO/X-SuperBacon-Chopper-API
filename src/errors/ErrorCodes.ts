export const ErrorCodes = {
    MISSING_CHECK_BY_USER_PARAMS: 1001,
    MISSING_TURNSTILE_TOKEN: 1002,
    INVALID_TURNSTILE_TOKEN: 1003,
    INVALID_IP_FORMAT: 1004,
    MISSING_CHECK_BY_USER_IP: 1005,
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];