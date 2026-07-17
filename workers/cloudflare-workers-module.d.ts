/**
 * Minimal, hand-written ambient declaration for the `cloudflare:workers`
 * virtual module — just the Workflows pieces workers/sync-workflow.ts
 * actually uses.
 *
 * Deliberately NOT a `/// <reference types="@cloudflare/workers-types" />`
 * or a project-wide `"types"` tsconfig entry: pulling in that package's
 * full ambient surface redefines lib.dom globals used throughout the rest
 * of the app (notably `Response.json()`, typed `unknown` there vs `any` in
 * lib.dom), which broke `tsc --noEmit` in a dozen unrelated client
 * components/lib files during cloud-4 development. Named type-only imports
 * from '@cloudflare/workers-types' (see lib/db/cloudflare-env.d.ts) don't
 * have this problem — only the wholesale ambient `reference`/`types`
 * inclusion does. This file keeps the Workflows types scoped to exactly
 * what's needed here.
 */
declare module 'cloudflare:workers' {
  export interface WorkflowStepRetryConfig {
    limit: number;
    delay: string | number;
    backoff?: 'constant' | 'linear' | 'exponential';
  }

  export interface WorkflowStepConfig {
    retries?: WorkflowStepRetryConfig;
    timeout?: string | number;
  }

  export abstract class WorkflowStep {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    do<T>(name: string, config: WorkflowStepConfig, callback: () => Promise<T>): Promise<T>;
    sleep(name: string, duration: string | number): Promise<void>;
    sleepUntil(name: string, timestamp: Date | number): Promise<void>;
  }

  export type WorkflowEvent<T> = Readonly<{
    payload: T;
    timestamp: Date;
    instanceId: string;
  }>;

  export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected ctx: unknown;
    protected env: Env;
    constructor(ctx: unknown, env: Env);
    run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
}
