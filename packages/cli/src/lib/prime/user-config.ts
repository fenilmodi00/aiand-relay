import {
  injectPiFamilyConfig,
  isPiFamilyPresent,
  piFamilyAuthJsonPath,
  piFamilyConfigDir,
  type PiFamilyAuthResult,
  type PiFamilyConfigResult,
  upsertPiFamilyAuth,
} from "../shared/pi-family-user-config.js";

export function primeConfigDir(home: string): string {
  return piFamilyConfigDir("prime", home);
}

export function isPrimePresent(home: string, binaryPresent: boolean): boolean {
  return isPiFamilyPresent("prime", home, binaryPresent);
}

export function primeAuthJsonPath(home: string): string {
  return piFamilyAuthJsonPath("prime", home);
}

export function injectPrimeUserConfig(home: string): Promise<PiFamilyConfigResult> {
  return injectPiFamilyConfig("prime", home);
}

export function upsertPrimeAuth(home: string, apiKey: string): Promise<PiFamilyAuthResult> {
  return upsertPiFamilyAuth("prime", home, apiKey);
}
