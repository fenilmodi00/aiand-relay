const RESET = "\x1b[0m";

/** ai& brand hues (truecolor) for the install / help banner. */
const BRAND = {
  teal: "\x1b[38;2;13;148;136m",
  glow: "\x1b[38;2;45;212;191m",
  deep: "\x1b[38;2;15;118;110m",
  ink: "\x1b[1;37m",
};

const MARKUP_TAGS = ["spark", "burst", "core", "trail", "ember", "brand", "fuse"] as const;
const TAG_PATTERN = new RegExp(`\\{(/?)(${MARKUP_TAGS.join("|")})\\}`, "g");

const TAGS: Record<(typeof MARKUP_TAGS)[number], string> = {
  spark: BRAND.glow,
  burst: BRAND.teal,
  core: BRAND.ink,
  trail: BRAND.deep,
  ember: BRAND.deep,
  brand: `${BRAND.teal}\x1b[1m`,
  fuse: "\x1b[2m",
};

/** Spark/bar install art; brand line is ai& Relay. */
const BANNER_ART = `{ember}^     ^     ^     ^     ^     ^     ^     ^     ^{/ember}
{spark}/^\\   /^\\   /^\\   /^\\   /^\\   /^\\   /^\\   /^\\   /^\\{/spark}
{trail}*     .     ★     .     ✦     .     ★     .     *{/trail}
{burst}\\\\    \\\\    \\\\     |     |     |     |     |     |    //    //    //{/burst}
{ember}░░▒▒▓▓{/ember}{burst}██████████████████████████████████████████████████████████{/burst}{ember}▓▓▒▒░░{/ember}
{ember}██▓▓▒▒░░{/ember}  {core}***{/core}  {brand}ai& Relay{/brand}  {core}***{/core}  {ember}░░▒▒▓▓██{/ember}
{ember}░░▒▒▓▓{/ember}{burst}██████████████████████████████████████████████████████████{/burst}{ember}▓▓▒▒░░{/ember}
{burst}//    //    //     |     |     |     |     |     |    \\\\    \\\\    \\\\{/burst}
{spark}\\v/   \\v/   \\v/   \\v/   \\v/   \\v/   \\v/   \\v/   \\v/{/spark}
{ember}v     v     v     v     v     v     v     v     v{/ember}
{fuse}one install · any harness{/fuse}`;

export function stripBannerMarkup(line: string): string {
  TAG_PATTERN.lastIndex = 0;
  return line.replace(TAG_PATTERN, "");
}

export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR === "0") {
    return false;
  }
  return Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR === "1";
}

function dim(text: string, color: boolean): string {
  return color ? `\x1b[2m${text}${RESET}` : text;
}

function successLine(text: string, color: boolean): string {
  return color ? `\x1b[32m✓${RESET} ${text}` : `✓ ${text}`;
}

export function centerBannerArt(art: string): string {
  const rawLines = art.split("\n");
  const visibleWidths = rawLines.map((line) => stripBannerMarkup(line).trim().length);
  const axisWidth = Math.max(0, ...visibleWidths);

  return rawLines
    .map((line, i) => {
      const width = visibleWidths[i] ?? 0;
      if (width === 0) {
        return "";
      }
      const pad = Math.max(0, Math.floor((axisWidth - width) / 2));
      const flushLeft = line.replace(/^ +/, "").replace(/ +$/, "");
      return " ".repeat(pad) + flushLeft;
    })
    .join("\n");
}

function renderLine(line: string, color: boolean): string {
  if (!color) {
    return stripBannerMarkup(line);
  }
  return line.replace(/\{([a-z]+)\}([\s\S]*?)\{\/\1\}/g, (_all, tag: string, inner: string) => {
    const open = TAGS[tag as keyof typeof TAGS];
    return open ? `${open}${inner}${RESET}` : inner;
  });
}

export function renderBannerArt(options?: { color?: boolean }): string {
  const color = options?.color ?? colorEnabled();
  return centerBannerArt(BANNER_ART)
    .split("\n")
    .map((line) => renderLine(line, color))
    .join("\n");
}

export function printBanner(options?: { context?: string; version?: string }): void {
  const color = colorEnabled();
  process.stdout.write(`${renderBannerArt({ color })}\n`);
  if (options?.version) {
    process.stdout.write(`${dim(`v${options.version}`, color)}\n`);
  }
  if (options?.context === "install") {
    process.stdout.write("\n");
    process.stdout.write(`${successLine("ai& Relay is installed.", color)}\n`);
  }
}
