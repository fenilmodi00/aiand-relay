import path from "node:path";

export function opencodeAuthJsonPath(opts: {
  home: string;
  env: NodeJS.ProcessEnv;
}): string {
  const dataHome = opts.env.XDG_DATA_HOME || path.join(opts.home, ".local", "share");
  return path.join(dataHome, "opencode", "auth.json");
}
