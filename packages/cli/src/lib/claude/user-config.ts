import path from "node:path";
import { isPresentByBinaryOrDirectory } from "../shared/native-user-config.js";

export type ClaudeNativeConfigDecision =
  | {
      status: "deferred";
      path: string;
      reason: "unsupported-custom-provider";
    }
  | {
      status: "deferred";
      path: string;
      reason: "destructive-proxy-redirection";
    };

export function claudeConfigDir(home: string): string {
  return path.join(home, ".claude");
}

export function claudeSettingsPath(home: string): string {
  return path.join(claudeConfigDir(home), "settings.json");
}

export function isClaudePresent(home: string, binaryPresent: boolean): boolean {
  return isPresentByBinaryOrDirectory(binaryPresent, claudeConfigDir(home));
}

export function decideClaudeNativeConfig(home: string): ClaudeNativeConfigDecision {
  return {
    status: "deferred",
    path: claudeSettingsPath(home),
    reason: "unsupported-custom-provider",
  };
}
