export const CHECK_STATUS = ['AVAILABLE', 'FORBIDDEN', 'NOT_FOUND', 'UNKNOWN', 'INVALID_URL', 'QUATE_FORBIDDEN'] as const;
export type CheckStatus = typeof CHECK_STATUS[number];

export interface AuthTokenSet {
    token: string;
    csrfToken: string;
}

export const IP_ACCESS_TYPE = {
    BLACKLIST: "blacklist",
    WHITELIST: "whitelist",
} as const;

export type IpAccessType = typeof IP_ACCESS_TYPE[keyof typeof IP_ACCESS_TYPE];

export type AccessSettings = {
    blacklistEnabled: boolean;
    whitelistEnabled: boolean;
};
