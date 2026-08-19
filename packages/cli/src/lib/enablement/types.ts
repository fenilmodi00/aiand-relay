import type { HarnessId } from "../harness.js";
import type { HarnessContext } from "../harness-types.js";

export type EnablementFamily = "persist" | "proxied";

export type EnablementResult = {
  label: string;
  model?: string;
  wrote?: string[];
  auth?: string;
  endpoint?: string;
  restartHint: string;
};

export type EnablementProfile = {
  id: HarnessId;
  label: string;
  family: EnablementFamily;
  paths: (ctx: HarnessContext) => string[];
  enable: (ctx: HarnessContext, apiKey: string) => Promise<EnablementResult>;
  status: (ctx: HarnessContext) => Promise<{
    connection: "on" | "off";
    provider?: string;
    auth?: string;
    model?: string;
    detail?: string;
  }>;
};
