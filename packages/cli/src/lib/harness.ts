export const HARNESS = {
  CLAUDE: "claude",
  CODEX: "codex",
  DEEPSEEK: "deepseek",
  GROK: "grok",
  OPENCODE: "opencode",
  PI: "pi",
  PRIME: "prime",
  HERMES: "hermes",
  OMP: "omp",
} as const;

export type HarnessId = (typeof HARNESS)[keyof typeof HARNESS];

export const ALL_HARNESSES = [
  HARNESS.CLAUDE,
  HARNESS.CODEX,
  HARNESS.DEEPSEEK,
  HARNESS.GROK,
  HARNESS.OPENCODE,
  HARNESS.PI,
  HARNESS.PRIME,
  HARNESS.HERMES,
  HARNESS.OMP,
] as const;

// The CLI binary each harness ships, used for `which`-based detection.
export const HARNESS_BIN: Record<HarnessId, string> = {
  [HARNESS.CLAUDE]: "claude",
  [HARNESS.CODEX]: "codex",
  [HARNESS.DEEPSEEK]: "dsh",
  [HARNESS.GROK]: "grok",
  [HARNESS.OPENCODE]: "opencode",
  [HARNESS.PI]: "pi",
  [HARNESS.PRIME]: "prime-agent",
  [HARNESS.HERMES]: "hermes",
  [HARNESS.OMP]: "omp",
};

export const HARNESS_LABEL: Record<HarnessId, string> = {
  [HARNESS.CLAUDE]: "Claude Code",
  [HARNESS.CODEX]: "Codex",
  [HARNESS.DEEPSEEK]: "DeepSeek Harness (alpha)",
  [HARNESS.GROK]: "Grok Build",
  [HARNESS.OPENCODE]: "OpenCode",
  [HARNESS.PI]: "Pi Code",
  [HARNESS.PRIME]: "Prime Agent",
  [HARNESS.HERMES]: "Hermes Agent",
  [HARNESS.OMP]: "omp",
};

export const HARNESS_INSTALL: Record<HarnessId, { command: string; url: string }> = {
  [HARNESS.CLAUDE]: {
    command: "npm install -g @anthropic-ai/claude-code",
    url: "https://docs.anthropic.com/en/docs/claude-code/setup",
  },
  [HARNESS.CODEX]: {
    command: "npm install -g @openai/codex",
    url: "https://github.com/openai/codex",
  },
  [HARNESS.DEEPSEEK]: {
    command: "npm install -g @deepseek-ai/dsh",
    url: "https://github.com/deepseek-ai/deepseek-harness",
  },
  [HARNESS.GROK]: {
    command: "curl -fsSL https://x.ai/cli/install.sh | bash",
    url: "https://github.com/xai-org/grok-build",
  },
  [HARNESS.OPENCODE]: {
    command: "npm install -g opencode-ai@latest",
    url: "https://github.com/anomalyco/opencode",
  },
  [HARNESS.PI]: {
    command: "npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
    url: "https://pi.dev/docs/latest/quickstart",
  },
  [HARNESS.PRIME]: {
    command: "curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh",
    url: "https://github.com/PrimeIntellect-ai/prime-agent",
  },
  [HARNESS.HERMES]: {
    command: "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
    url: "https://hermes-agent.nousresearch.com/docs/getting-started/installation",
  },
  [HARNESS.OMP]: {
    command:
      "bun install -g @oh-my-pi/pi-coding-agent (macOS/Linux: curl -fsSL https://omp.sh/install | sh; Windows: irm https://omp.sh/install.ps1 | iex)",
    url: "https://omp.sh/",
  },
};
