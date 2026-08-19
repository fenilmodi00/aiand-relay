import path from "node:path";
import os from "node:os";

export function relayHomeFor(home: string): string {
  return process.env.AIANDRELAY_HOME || path.join(home || os.homedir(), ".aiandrelay");
}
