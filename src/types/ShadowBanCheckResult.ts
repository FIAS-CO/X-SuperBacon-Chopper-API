export interface ShadowBanCheckResult {
    not_found: boolean;
    suspend: boolean;
    protect: boolean;
    no_tweet: boolean;
    search_ban: boolean;
    search_suggestion_ban: boolean;
    no_reply: boolean;
    ghost_ban: boolean;
    reply_deboosting: boolean;
    user: any | null;
    api_status: {
        userSearchGroup: {
            rate_limit: boolean,
            error: string | undefined
        },
        userTimelineGroup: {
            rate_limit: boolean,
            error: string | undefined
        }
    }
}