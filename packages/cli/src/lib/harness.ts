export const HARNESS = {
  CLAUDE: "claude",
  CODEX: "codex",
  OPENCODE: "opencode",
  PI: "pi",
  PRIME: "prime",
  HERMES: "hermes",
} as const;

export type HarnessId = (typeof HARNESS)[keyof typeof HARNESS];

export const ALL_HARNESSES = [
  HARNESS.CLAUDE,
  HARNESS.CODEX,
  HARNESS.OPENCODE,
  HARNESS.PI,
  HARNESS.PRIME,
  HARNESS.HERMES,
] as const;

// The CLI binary each harness ships, used for `which`-based detection.
export const HARNESS_BIN: Record<HarnessId, string> = {
  [HARNESS.CLAUDE]: "claude",
  [HARNESS.CODEX]: "codex",
  [HARNESS.OPENCODE]: "opencode",
  [HARNESS.PI]: "pi",
  [HARNESS.PRIME]: "prime-agent",
  [HARNESS.HERMES]: "hermes",
};

export const HARNESS_LABEL: Record<HarnessId, string> = {
  [HARNESS.CLAUDE]: "Claude Code",
  [HARNESS.CODEX]: "Codex",
  [HARNESS.OPENCODE]: "OpenCode",
  [HARNESS.PI]: "Pi Code",
  [HARNESS.PRIME]: "Prime Agent",
  [HARNESS.HERMES]: "Hermes Agent",
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
};
