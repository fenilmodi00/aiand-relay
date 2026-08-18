import {
  injectPiFamilyConfig,
  isPiFamilyPresent,
  locatePiFamilyConfigFile,
  piFamilyConfigDir,
  type PiFamilyConfigErrorReason,
  type PiFamilyConfigResult,
} from "../shared/pi-family-user-config.js";
import type { NativeUserConfigInjector } from "../shared/native-user-config.js";

export const ompNativeUserConfig: NativeUserConfigInjector<PiFamilyConfigErrorReason> = {
  harness: "omp",
  isPresent: ({ home, binaryPresent }) => isPiFamilyPresent("omp", home, binaryPresent),
  injectUserConfig: ({ home }) => injectPiFamilyConfig("omp", home),
};

export function ompConfigDir(home: string): string {
  return piFamilyConfigDir("omp", home);
}

export function isOmpPresent(home: string, binaryPresent: boolean): boolean {
  return ompNativeUserConfig.isPresent({ home, env: {}, binaryPresent });
}

export function locateOmpModelsFile(home: string): string {
  return locatePiFamilyConfigFile("omp", home).filePath;
}

export function injectOmpUserConfig(home: string): Promise<PiFamilyConfigResult> {
  return ompNativeUserConfig.injectUserConfig({ home, env: {} });
}
