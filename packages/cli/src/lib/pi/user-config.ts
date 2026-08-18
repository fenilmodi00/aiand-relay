import {
  injectPiFamilyConfig,
  isPiFamilyPresent,
  piFamilyAuthJsonPath,
  piFamilyConfigDir,
  type PiFamilyConfigErrorReason,
  type PiFamilyAuthResult,
  type PiFamilyConfigResult,
  upsertPiFamilyAuth,
} from "../shared/pi-family-user-config.js";
import type { NativeUserConfigInjector } from "../shared/native-user-config.js";

export const piNativeUserConfig: NativeUserConfigInjector<
  PiFamilyConfigErrorReason,
  "invalid-json" | "not-object"
> = {
  harness: "pi",
  isPresent: ({ home, binaryPresent }) => isPiFamilyPresent("pi", home, binaryPresent),
  injectUserConfig: ({ home }) => injectPiFamilyConfig("pi", home),
  persistAuth: ({ home, apiKey }) => upsertPiFamilyAuth("pi", home, apiKey),
};

export function piConfigDir(home: string): string {
  return piFamilyConfigDir("pi", home);
}

export function isPiPresent(home: string, binaryPresent: boolean): boolean {
  return piNativeUserConfig.isPresent({ home, env: {}, binaryPresent });
}

export function piAuthJsonPath(home: string): string {
  return piFamilyAuthJsonPath("pi", home);
}

export function injectPiUserConfig(home: string): Promise<PiFamilyConfigResult> {
  return piNativeUserConfig.injectUserConfig({ home, env: {} });
}

export function upsertPiAuth(home: string, apiKey: string): Promise<PiFamilyAuthResult> {
  return piNativeUserConfig.persistAuth({ home, env: {}, apiKey });
}
