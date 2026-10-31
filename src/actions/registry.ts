import type { z } from "zod";
import type { HostingProvider } from "../hosting/provider.ts";
import type { Ctx, Risk } from "../types.ts";

export type Deps = { hosting: HostingProvider };

type Base<S extends z.ZodType> = {
  name: string;
  description: string;
  params: S;
  siteId?: (params: z.infer<S>) => string;
};

export type ReadAction<S extends z.ZodType = z.ZodType> = Base<S> & {
  risk: "read";
  run: (params: z.infer<S>, ctx: Ctx, deps: Deps) => unknown;
};

export type ChangeAction<S extends z.ZodType = z.ZodType> = Base<S> & {
  risk: Exclude<Risk, "read">;
  siteId: (params: z.infer<S>) => string;
  plan: (params: z.infer<S>, deps: Deps) => string;
  execute: (params: z.infer<S>, deps: Deps) => void;
  verify: (params: z.infer<S>, deps: Deps) => boolean;
};

export type Action = ReadAction | ChangeAction;

export const defineRead = <S extends z.ZodType>(a: ReadAction<S>) => a as unknown as ReadAction;
export const defineChange = <S extends z.ZodType>(a: ChangeAction<S>) => a as unknown as ChangeAction;
