/** Shared options type for all walkthrough/benchmark functions. */
export interface WalkthroughOpts<TPage = unknown> {
    page: TPage | null;
    url: string;
    timeout: number;
    verbose?: boolean;
    durationMs?: number;
}
