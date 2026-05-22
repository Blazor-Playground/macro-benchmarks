/** Shared options type for all walkthrough/benchmark functions. */
export interface WalkthroughOpts<TPage = unknown> {
    page: TPage | null;
    url: string;
    timeout: number;
    verbose?: boolean;
    durationMs?: number;
}

/** Extended result from a walkthrough that includes OTEL server-side metrics. */
export interface WalkthroughWithOtel {
    value: number;
    otel: Record<string, number>;
}

/** A walkthrough function can return a plain number or a number + OTEL metrics. */
export type WalkthroughResult = number | WalkthroughWithOtel;

/** Type guard: check if a walkthrough result includes OTEL data. */
export function hasOtel(result: WalkthroughResult): result is WalkthroughWithOtel {
    return typeof result === 'object' && result !== null && 'otel' in result;
}
