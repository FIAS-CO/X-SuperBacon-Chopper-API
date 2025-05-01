export const CHECK_STATUS = ['AVAILABLE', 'FORBIDDEN', 'NOT_FOUND', 'UNKNOWN', 'INVALID_URL', 'QUATE_FORBIDDEN'] as const;
export type CheckStatus = typeof CHECK_STATUS[number];

export interface AuthTokenSet {
    token: string;
    csrfToken: string;
}