const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";

export function printSuccess(message: string): void {
  console.log(`${GREEN}✓${RESET} ${message}`);
}

export function printDetail(label: string, value: string): void {
  console.log(`  ${DIM}${label}: ${value}${RESET}`);
}

export function printNote(message: string): void {
  console.log(`${DIM}${message}${RESET}`);
}

export function printRestartHint(tool: string): void {
  console.log("");
  console.log(`Restart ${tool} to use the new setup.`);
}

export function printHarnessConnected(label: string, model?: string): void {
  printSuccess(model ? `${label} → ai& · ${model}` : `${label} → ai&`);
}

export function printHarnessRestored(label: string): void {
  printSuccess(`${label} restored from snapshot`);
}

export function printHarnessUnchanged(label: string): void {
  printNote(`${label} was not connected (nothing to restore).`);
}

export function printCommandHint(label: string, command: string): void {
  const prefix = label.endsWith(":") ? label : `${label}:`;
  console.log(`${prefix} ${CYAN}${command}${RESET}`);
}
