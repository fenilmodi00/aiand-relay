import os from "node:os";
import { spawn } from "node:child_process";
import { readGlobalConfig, resolveStoredApiKey, setGlobalApiKey } from "./global-config.js";

export const AIAND_DOCS_URL = "https://docs.aiand.com/";

export type EnsureApiKeyPrompts = {
  select: (opts: {
    message: string;
    options: Array<{ value: string; label: string; hint?: string }>;
  }) => Promise<unknown>;
  password: (opts: {
    message: string;
    validate?: (value: string) => string | undefined;
  }) => Promise<unknown>;
  isCancel: (value: unknown) => boolean;
  cancel: (message?: string) => void;
  log: {
    info: (message: string) => void;
    success: (message: string) => void;
    warn: (message: string) => void;
  };
};

export function isInteractiveSession(
  stdin: NodeJS.ReadStream = process.stdin,
  stdout: NodeJS.WriteStream = process.stdout,
): boolean {
  return Boolean(stdin.isTTY && stdout.isTTY);
}

async function hasStoredOrEnvKey(home: string): Promise<boolean> {
  if (process.env.AIAND_API_KEY?.trim()) {
    return true;
  }
  try {
    const existing = resolveStoredApiKey((await readGlobalConfig(home)).apiKey);
    return Boolean(existing);
  } catch {
    return false;
  }
}

export async function openAiandDocsInBrowser(url: string = AIAND_DOCS_URL): Promise<boolean> {
  const platform = process.platform;
  try {
    await new Promise<void>((resolve, reject) => {
      let child;
      if (platform === "darwin") {
        child = spawn("open", [url], { stdio: "ignore", detached: true });
      } else if (platform === "win32") {
        child = spawn("cmd", ["/c", "start", "", url], {
          stdio: "ignore",
          detached: true,
          windowsHide: true,
        });
      } else {
        child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
      }
      child.on("error", reject);
      child.unref();
      // Resolve once spawned; do not wait for browser exit.
      resolve();
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensureApiKeyInteractive(options?: {
  home?: string;
  interactive?: boolean;
  prompts?: EnsureApiKeyPrompts;
  openDocs?: (url: string) => Promise<boolean>;
  apiKey?: string;
}): Promise<boolean> {
  const home = options?.home ?? os.homedir();
  const flagKey = options?.apiKey?.trim();
  if (flagKey) {
    process.env.AIAND_API_KEY = flagKey;
    return true;
  }
  if (await hasStoredOrEnvKey(home)) {
    // Ensure process env is populated from stored config for harness interpolation.
    if (!process.env.AIAND_API_KEY?.trim()) {
      const resolved = resolveStoredApiKey((await readGlobalConfig(home)).apiKey);
      if (resolved) {
        process.env.AIAND_API_KEY = resolved;
      }
    }
    return true;
  }

  const interactive = options?.interactive ?? isInteractiveSession();
  if (!interactive) {
    return false;
  }

  let prompts: EnsureApiKeyPrompts;
  if (options?.prompts) {
    prompts = options.prompts;
  } else {
    const clack = await import("@clack/prompts");
    prompts = {
      select: clack.select,
      password: clack.password,
      isCancel: clack.isCancel,
      cancel: clack.cancel,
      log: clack.log,
    };
  }
  const openDocs = options?.openDocs ?? openAiandDocsInBrowser;

  // Loop: Enter | Open docs until key saved or cancel.
  for (;;) {
    const choice = await prompts.select({
      message: "ai& API key required to continue",
      options: [
        { value: "enter", label: "Enter API key", hint: "paste from docs.aiand.com" },
        { value: "docs", label: "Open docs in browser", hint: AIAND_DOCS_URL },
      ],
    });
    if (prompts.isCancel(choice)) {
      prompts.cancel("Cancelled.");
      return false;
    }
    if (choice === "docs") {
      const opened = await openDocs(AIAND_DOCS_URL);
      if (opened) {
        prompts.log.info(`Opened ${AIAND_DOCS_URL}`);
      } else {
        prompts.log.warn(`Could not open a browser. Visit ${AIAND_DOCS_URL}`);
      }
      continue;
    }

    const entered = await prompts.password({
      message: "ai& API key:",
      validate: (value) => (value.trim() ? undefined : "An API key is required"),
    });
    if (prompts.isCancel(entered)) {
      prompts.cancel("Cancelled.");
      return false;
    }
    const apiKey = String(entered).trim();
    await setGlobalApiKey(home, apiKey);
    process.env.AIAND_API_KEY = apiKey;
    prompts.log.success("ai& API key saved to ~/.aiandrelay/config.json");
    return true;
  }
}
