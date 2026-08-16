import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

const installCommand = "curl -fsSL https://aiand-relay.vercel.app/install.sh | sh";
const githubUrl = "https://github.com/fenilmodi00/aiand-relay";
const docsUrl = "https://github.com/fenilmodi00/aiand-relay/blob/main/README.md";
const aiandApiKeysUrl = "https://docs.aiand.com/";
const llmsUrl = "/llms.txt";

type Agent = {
  name: string;
  command: string;
  status: "Stable" | "Beta";
  mark: ReactNode;
  blurb: string;
};

const agents: Agent[] = [
  {
    name: "Claude Code",
    command: "aclaude",
    status: "Beta",
    mark: <ClaudeMark />,
    blurb:
      "Routes Claude Code through a local Anthropic-to-ai& translation proxy. Your subscription, login, and config stay untouched.",
  },
  {
    name: "Codex CLI",
    command: "acodex",
    status: "Stable",
    mark: <CodexMark />,
    blurb:
      "Talks to ai& through a local Responses-to-chat proxy, with headless exec support. Sessions stay resumable across providers.",
  },
  {
    name: "OpenCode",
    command: "aopencode",
    status: "Stable",
    mark: <OpenCodeMark />,
    blurb:
      "Launches with ai& wired in as an OpenAI-compatible provider, injected only for that run. Close it and your setup is exactly as it was.",
  },
  {
    name: "Pi Code",
    command: "apiagent",
    status: "Stable",
    mark: <PiMark />,
    blurb:
      "Starts with a custom ai& provider and a temporary config directory, while normal local session history keeps persisting.",
  },
  {
    name: "Prime Agent",
    command: "aprime",
    status: "Beta",
    mark: <PrimeMark />,
    blurb:
      "PrimeIntellect's RLM agent, with its persistent IPython tool and subagents running on ai& models. Your own Prime config stays untouched.",
  },
  {
    name: "Hermes Agent",
    command: "ahermes",
    status: "Beta",
    mark: <HermesMark />,
    blurb:
      "Nous Research's Hermes Agent on ai&, with config under a relay-owned home. Your real ~/.hermes stays untouched.",
  },
  {
    name: "omp",
    command: "aomp",
    status: "Beta",
    mark: <OmpMark />,
    blurb:
      "Oh My Pi (omp) on ai&, with models.yml under a relay-owned agent dir. Your personal ~/.omp stays untouched.",
  },
];

const steps = [
  {
    title: "Install once",
    body: (
      <>
        Run the one-liner. It drops <code>aiandrelay</code> plus <code>aclaude</code>,{" "}
        <code>acodex</code>, <code>aopencode</code>, <code>apiagent</code>, <code>aprime</code>,{" "}
        <code>ahermes</code>, and <code>aomp</code> onto your PATH and installs Bun if you
        don&apos;t have it.
      </>
    ),
  },
  {
    title: "Add your key",
    body: (
      <>
        On first run, <code>aiandrelay configure</code> asks for your{" "}
        <a className="link" href={aiandApiKeysUrl} target="_blank" rel="noopener noreferrer">
          ai&
        </a>{" "}
        API key. Native web search is not supported.
      </>
    ),
  },
  {
    title: "Launch an agent",
    body: (
      <>
        Type <code>aclaude</code> or <code>acodex</code> and keep working. The Relay injects ai&
        settings for that run only. Nothing is written to your real agent config.
      </>
    ),
  },
];

const features = [
  {
    title: "One relay, seven harnesses",
    body: "Claude Code, Codex, OpenCode, Pi Code, Prime Agent, Hermes Agent, and omp all run on ai& open models through a single local install.",
  },
  {
    title: "OpenAI-compatible upstream",
    body: "The proxy translates Anthropic Messages and Codex Responses into ai& chat completions. Native web_search server tools are refused with a clear error.",
  },
  {
    title: "Cost tracking per session",
    body: "Every turn is metered against the model's real per-token rates and printed as a running total when you exit.",
  },
  {
    title: "Config-free & self-updating",
    body: "Nothing rewrites your agent config files. The installed binary keeps itself current from the release site.",
  },
];

const stats = [
  { value: "5", label: "coding agents" },
  { value: "1", label: "install command" },
  { value: "0", label: "config files rewritten" },
];

const modelHighlights = [
  { name: "GLM 5.2", note: "default coding" },
  { name: "Kimi K2.7 Code", note: "vision" },
  { name: "Motif 3", note: "text fallback" },
  { name: "Kimi K3", note: "default coding" },
  { name: "Kimi K2.6", note: "vision" },
  { name: "DeepSeek V4 Flash", note: "fast 1M context" },
  { name: "DeepSeek V4 Pro", note: "long-context reasoning" },
];

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "select">("idle");
  const [release, setRelease] = useState<{ version?: string; age?: string }>({});
  const commandRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/latest.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((m: { version?: string; publishedAt?: string }) => {
        setRelease({
          version: m.version ? `v${m.version}` : undefined,
          age: formatReleaseAge(m.publishedAt) ?? undefined,
        });
      })
      .catch(() => {});
  }, []);

  const handleCopy = async () => {
    try {
      await copyText(installCommand);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      const node = commandRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNode(node);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      setCopyState("select");
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  };

  const releaseLabel =
    [release.version, release.age].filter(Boolean).join(" · ") || "auto-updating";

  return (
    <div className="min-h-screen bg-white">
      {/* subtle top glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_100%_at_50%_-10%,#f1f0ff_0%,rgba(255,255,255,0)_70%)]"
      />

      <div className="mx-auto max-w-[1120px] px-6 max-[520px]:px-4">
        {/* NAV */}
        <header className="flex items-center gap-3 py-5">
          <a href="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="flex items-baseline gap-1.5">
              <span className="text-[15.5px] font-semibold tracking-tight text-ink">ai& Relay</span>
            </span>
          </a>
          <nav className="ml-auto flex items-center gap-1 text-[14px] font-medium text-muted">
            <a
              className="hidden rounded-lg px-3 py-2 transition hover:bg-code hover:text-ink sm:block"
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </a>
            <a
              className="hidden rounded-lg px-3 py-2 transition hover:bg-code hover:text-ink sm:block"
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a
              className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-[#000000] px-3.5 py-2 text-[13.5px] font-semibold text-white shadow-[0_1px_2px_rgba(10,10,10,.14),0_8px_20px_-8px_rgba(0,0,0,.7)] transition hover:brightness-[1.06] active:scale-[.98]"
              href={aiandApiKeysUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get API key
              <ArrowUpRight />
            </a>
          </nav>
        </header>

        {/* HERO */}
        <section className="pt-14 pb-6 text-center max-[520px]:pt-10">
          <a
            href={aiandApiKeysUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/80 py-1.5 pr-3.5 pl-1.5 text-[13px] font-medium text-muted shadow-[0_1px_2px_rgba(10,10,10,.04)] backdrop-blur transition hover:text-ink"
          >
            <img src="/aiand-logo.png" alt="" aria-hidden="true" className="size-5 rounded-full" />
            Powered by ai&
            <span className="text-faint">·</span>
            <span className="text-ink">open models</span>
          </a>

          <h1 className="mx-auto max-w-[860px] text-balance text-[clamp(36px,6.4vw,60px)] font-semibold leading-[1.04] tracking-[-0.02em] text-ink">
            Run your coding agents on{" "}
            <span className="relative whitespace-nowrap">
              ai&
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-lime/70"
                style={{ zIndex: -1 }}
              />
            </span>
          </h1>
          <p className="mx-auto mt-6 mb-9 max-w-[600px] text-pretty text-[18.5px] leading-relaxed text-muted">
            A local relay that points Claude Code, Codex, OpenCode, Pi Code, and Prime Agent at open
            models on ai&, including Kimi, Qwen, MiniMax, and DeepSeek V4, with short commands and
            zero edits to your real tool config.
          </p>

          {/* dark install card: the focal surface */}
          <div className="mx-auto max-w-[680px]">
            <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(150deg,var(--color-surface)_0%,var(--color-surface-2)_100%)] p-2 shadow-[0_1px_2px_rgba(10,10,10,.1),0_30px_60px_-30px_rgba(10,15,30,.6)]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-16 right-6 size-40 rounded-full bg-lime/18 blur-3xl"
              />
              <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-2">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="ml-2 font-mono text-[11.5px] tracking-wide text-white/40">
                  install.sh
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-black/25 px-4 py-3.5 text-left ring-1 ring-white/[.06] max-[560px]:flex-col max-[560px]:items-stretch">
                <span className="select-none font-mono text-[15px] text-brand">$</span>
                <code
                  ref={commandRef}
                  className="min-w-0 flex-1 overflow-x-auto font-mono text-[13.5px] leading-snug whitespace-nowrap text-white/90 max-[560px]:text-[12.5px]"
                >
                  {installCommand}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copy install command"
                  className="inline-flex min-w-[92px] cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 font-sans text-[13px] font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15 active:scale-95 data-[copied=true]:bg-brand data-[copied=true]:text-white data-[copied=true]:ring-brand"
                  data-copied={copyState === "copied"}
                >
                  {copyState === "copied" ? (
                    <>
                      <CheckMark /> Copied
                    </>
                  ) : copyState === "select" ? (
                    "Press ⌘C"
                  ) : (
                    <>
                      <CopyMark /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-faint">
              macOS &amp; Linux · installs Bun if needed · stays up to date ({releaseLabel})
            </p>
          </div>

          {/* agent command pills */}
          <div className="mx-auto mt-9 flex max-w-[640px] flex-wrap items-center justify-center gap-2.5">
            {agents.map((a) => (
              <div
                key={a.command}
                className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white py-1.5 pr-3.5 pl-2 text-[13.5px] shadow-[0_1px_2px_rgba(10,10,10,.03)]"
              >
                <span className="flex size-6 items-center justify-center text-ink">{a.mark}</span>
                <span className="font-mono font-medium text-ink">{a.command}</span>
              </div>
            ))}
          </div>

          {/* stats */}
          <div className="mx-auto mt-10 grid max-w-[560px] grid-cols-3 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-line-strong bg-canvas px-4 py-3.5 text-left"
              >
                <div className="text-[26px] font-semibold leading-none text-ink tabular-nums">
                  {s.value}
                </div>
                <div className="mt-1.5 text-[12.5px] font-medium leading-snug text-muted">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-7 max-w-[780px] rounded-2xl border border-line-strong bg-white px-4 py-3 shadow-[0_1px_2px_rgba(10,10,10,.03)]">
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {modelHighlights.map((model) => (
                <span
                  key={model.name}
                  className="inline-flex items-center gap-2 rounded-full bg-code px-3 py-1.5 text-[12.5px] text-muted"
                >
                  <span className="font-semibold text-ink">{model.name}</span>
                  <span className="text-faint">·</span>
                  <span>{model.note}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* START / HOW IT WORKS */}
        <section className="mt-20 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-line-strong bg-white p-7 max-[520px]:p-6">
            <SectionEyebrow>Start relaying</SectionEyebrow>
            <h2 className="mt-3 mb-6 text-[24px] font-semibold tracking-tight text-ink">
              Three commands from zero to running.
            </h2>
            <ol className="flex flex-col gap-5">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink text-[13px] font-semibold text-white tabular-nums">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-[15.5px] font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-muted [&_a.link]:font-medium [&_a.link]:text-violet [&_a.link]:underline [&_a.link]:decoration-violet/30 [&_a.link]:underline-offset-2 hover:[&_a.link]:decoration-violet [&_code]:rounded [&_code]:bg-code [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-ink">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* dark accent card: echoes the dashboard's dedicated-endpoints panel */}
          <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(155deg,var(--color-surface)_0%,var(--color-surface-2)_100%)] p-7 max-[520px]:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-20 -right-10 size-56 rounded-full bg-violet/25 blur-3xl"
            />
            <div className="relative">
              <h3 className="text-[26px] font-semibold leading-tight tracking-tight text-brand">
                One key.
                <br />
                Every agent.
              </h3>
              <p className="mt-4 max-w-[280px] text-[14.5px] leading-relaxed text-white/65">
                One ai& key powers all five agents through a single local proxy. The model list is
                pulled live from ai&, with bundled fallbacks for new DeepSeek V4 models while
                regional catalogs catch up.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Kimi K3", "Kimi K2.6", "DeepSeek V4 Flash", "DeepSeek V4 Pro", "Qwen 3.5"].map(
                  (m) => (
                    <span
                      key={m}
                      className="rounded-full bg-white/[.08] px-3 py-1.5 font-mono text-[12px] text-white/75 ring-1 ring-white/10"
                    >
                      {m}
                    </span>
                  ),
                )}
              </div>
              <a
                href={aiandApiKeysUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:brightness-[1.06] active:scale-[.98]"
              >
                Get an ai& key
                <ArrowUpRight />
              </a>
            </div>
          </div>
        </section>

        {/* AGENT GRID */}
        <section className="mt-20">
          <SectionEyebrow>Supported harnesses</SectionEyebrow>
          <h2 className="mt-3 mb-7 max-w-[620px] text-[26px] font-semibold tracking-tight text-ink">
            The coding agents you already use, on open models.
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {agents.map((a) => (
              <article
                key={a.name}
                className="group flex flex-col rounded-2xl border border-line-strong bg-white p-6 transition hover:border-faint hover:shadow-[0_1px_2px_rgba(10,10,10,.04),0_16px_40px_-24px_rgba(10,15,30,.28)]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl border border-line-strong bg-canvas text-ink">
                    {a.mark}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
                <div className="mt-4 flex items-baseline gap-2.5">
                  <h3 className="text-[17px] font-semibold text-ink">{a.name}</h3>
                  <code className="font-mono text-[13px] text-violet">{a.command}</code>
                </div>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{a.blurb}</p>
              </article>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section className="mt-20">
          <SectionEyebrow>Why route through the Relay</SectionEyebrow>
          <div className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line-strong bg-white p-5">
                <span className="mb-4 block h-1 w-8 rounded-full bg-brand" />
                <h3 className="text-[15px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CLOSING CTA */}
        <section className="mt-20 mb-6 overflow-hidden rounded-2xl border border-line-strong bg-canvas px-8 py-12 text-center max-[520px]:px-5">
          <h2 className="mx-auto max-w-[560px] text-balance text-[28px] font-semibold tracking-tight text-ink">
            Point your agents at ai& in one line.
          </h2>
          <p className="mx-auto mt-3 mb-7 max-w-[480px] text-[15px] leading-relaxed text-muted">
            Free to install, config-free, and reversible. Your subscriptions and logins stay exactly
            where they are.
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2.5 rounded-xl bg-ink px-5 py-3 font-mono text-[13.5px] text-white shadow-[0_1px_2px_rgba(10,10,10,.14),0_16px_40px_-20px_rgba(10,15,30,.6)] transition hover:brightness-110 active:scale-[.98]"
          >
            <span className="text-brand">$</span>
            <span className="max-[520px]:hidden">
              curl -fsSL aiand-relay.vercel.app/install.sh | sh
            </span>
            <span className="hidden max-[520px]:inline">curl … | sh</span>
            <span className="ml-1 text-white/50">{copyState === "copied" ? "✓" : "⧉"}</span>
          </button>
        </section>

        {/* FOOTER */}
        <footer className="mt-4 flex flex-col gap-4 border-t border-line py-8 text-[13px] text-muted sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-semibold text-ink">ai& Relay</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:ml-auto">
            <a
              className="transition hover:text-ink"
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </a>
            <a
              className="transition hover:text-ink"
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a
              className="transition hover:text-ink"
              href={llmsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              llms.txt
            </a>
            <a
              className="transition hover:text-ink"
              href={aiandApiKeysUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              ai& keys
            </a>
            <span className="text-faint">MIT licensed</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

function SectionEyebrow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-violet uppercase">
      <span className="size-1.5 rounded-full bg-lime" />
      {children}
    </span>
  );
}

function StatusBadge({ status }: Readonly<{ status: "Stable" | "Beta" }>) {
  const stable = status === "Stable";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase"
      style={{
        background: stable ? "rgba(198,241,53,.16)" : "rgba(106,92,243,.1)",
        color: stable ? "var(--color-lime-ink)" : "var(--color-violet)",
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: stable ? "#7fae00" : "var(--color-violet)" }}
      />
      {status === "Stable" ? "Supported" : "Beta"}
    </span>
  );
}

function BrandMark() {
  return (
    <span className="relative flex size-8 items-center justify-center rounded-[9px] bg-ink">
      <span className="absolute inset-0 rounded-[9px] bg-[radial-gradient(120%_120%_at_20%_0%,rgba(199,0,7,.5)_0%,rgba(199,0,7,0)_55%)]" />
      <PiMarkWhite />
    </span>
  );
}

function PiMarkWhite() {
  return (
    <svg className="relative size-[18px]" viewBox="0 0 800 800" aria-hidden="true">
      <path
        fill="#c70007"
        fillRule="evenodd"
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
      />
      <path fill="#ffffff" d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}

function ArrowUpRight() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L17 7M17 7H8M17 7v9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OpenCodeMark() {
  return (
    <svg className="h-6 w-[19px]" viewBox="0 0 240 300" fill="none" aria-hidden="true">
      <path d="M180 240H60V120H180V240Z" fill="#CFCECD" />
      <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#211E1E" />
    </svg>
  );
}

function ClaudeMark() {
  return (
    <svg className="size-[22px]" viewBox="0 0 1200 1200" aria-hidden="true">
      <path
        fill="#d97757"
        d="M233.96 800.215 468.644 668.537l3.947-11.436-3.947-6.363h-11.436l-39.221-2.416-134.094-3.624-116.296-4.832-112.671-6.04-28.349-6.041L0 592.752l2.738-17.477 23.839-16.027 34.148 2.98 75.463 5.155 113.235 7.812 82.148 4.832 121.691 12.644h19.329l2.738-7.812-6.604-4.832-5.154-4.832-117.182-79.41-126.846-83.919-66.442-48.322-35.92-24.483-18.12-22.953-7.813-50.094 32.617-35.92 43.812 2.98 11.195 2.98 44.376 34.148 94.792 73.369 123.785 91.168 18.121 15.06 7.248-5.154.886-3.624-8.134-13.611-67.329-121.691-71.839-123.785-31.973-51.302-8.456-30.765c-2.98-12.644-5.154-23.275-5.154-36.241L312.322 13.208l20.537-6.604 49.53 6.604 20.859 18.121 30.765 70.389 49.852 110.819 77.316 150.684 22.631 44.698 12.08 41.396 4.511 12.645h7.812v-7.248l6.362-84.886 11.759-104.215 11.436-134.094 3.946-37.772 18.685-45.262L697.53 24l28.993 13.852L750.363 72l-3.302 22.067-14.175 92.134-27.785 144.322-18.121 96.645h10.55l12.081-12.081 48.886-64.912 82.148-102.685 36.241-40.752 42.282-45.02 27.141-21.423h51.302l37.772 56.134-16.913 57.987-52.832 67.007-43.812 56.778-62.819 84.564-39.221 67.651 3.624 5.396 9.342-.886 141.906-30.201 76.671-13.852 91.49-15.705 41.396 19.329 4.51 19.651-16.268 40.188-97.852 24.161-114.765 22.953-170.899 40.429-2.094 1.53 2.416 2.98 76.993 7.248 32.94 1.772h80.617l150.121 11.195 39.221 25.933 23.517 31.732-3.946 24.161-60.403 30.765-81.503-19.329-190.228-45.262-65.235-16.268h-9.02v5.396l54.362 53.154 99.624 89.96 124.752 115.973 6.362 28.671-16.027 22.631-16.912-2.416-109.611-82.47-42.282-37.127-95.758-80.618h-6.363v8.456l22.067 32.295 116.537 175.168 6.04 53.718-8.456 17.476-30.201 10.55-33.181-6.04-68.215-95.758-70.389-107.839-56.779-96.644-6.926 3.946-33.503 360.886-15.705 18.443L565.53 1200l-30.201-22.953-16.027-37.127 16.027-73.369 19.329-95.758 15.705-76.107 14.174-94.55 8.456-31.41-.563-2.095-6.927.886-71.275 97.852-108.402 146.497-85.772 91.812-20.537 8.134-35.597-18.443 3.302-32.939 19.893-29.316 118.711-151.007 71.597-93.583 46.228-54.04-.323-7.812h-2.738L205.289 929.396l-56.135 7.248-24.161-22.63 2.98-37.128 11.436-12.081 94.792-65.234-.322.322Z"
      />
    </svg>
  );
}

function CodexMark() {
  return (
    <svg
      className="size-[24px]"
      viewBox="2 2.7 20 18.7"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <title>Codex</title>
      <path
        d="M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z"
        fill="url(#codex-mark-gradient)"
      />
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="codex-mark-gradient"
          x1="12"
          x2="12"
          y1="3"
          y2="21"
        >
          <stop stopColor="#B1A7FF" />
          <stop offset=".5" stopColor="#7A9DFF" />
          <stop offset="1" stopColor="#3941FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PiMark() {
  return (
    <svg className="size-[22px]" viewBox="0 0 800 800" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
      />
      <path fill="currentColor" d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}
function PrimeMark() {
  // Recursive/nested squares: the RLM idea of agents spawning agents.
  return (
    <svg className="size-[22px]" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="7.25"
        y="7.25"
        width="9.5"
        height="9.5"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect x="10.75" y="10.75" width="2.5" height="2.5" rx="0.6" fill="currentColor" />
    </svg>
  );
}

function HermesMark() {
  return (
    <svg
      className="size-[22px]"
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5.938 12.835c.127-.039.285.02.373.143.028.038.036.092.046.14.003.014-.02.033-.04.05-.124-.098-.24-.194-.354-.291-.011-.01-.016-.027-.025-.042zM8.396 9.412c.195-.032.39-.06.588-.05a.54.54 0 01.148.026c.202.071.402.147.601.224.028.01.05.036.075.055l-.013.027a9.203 9.203 0 01-.26-.089c-.115-.038-.213-.077-.315-.098-.25-.05-.25-.046-.292-.014l.574.144c.275.139.55.276.823.417.042.022.09.057.107.098.026.06.063.076.117.072.066-.006.132-.017.213-.027l-.04.086c.051.08.142.02.216.064-.074.13-.247.09-.334.199l.061.074-.12.087c0 .106-.038.168-.306.243l.026.085-.196.042.07.124h-.25l-.007.137c-.081-.01-.161-.018-.244-.027l-.053.123c-.027-.008-.052-.011-.073-.023-.067-.038-.128-.056-.195.006-.019.017-.063.014-.093.008-.026-.006-.05-.029-.07-.042-.11.095-.11.095-.208.003-.057.046-.12.074-.186.011-.063.027-.123-.02-.178-.014-.07.007-.097-.035-.133-.07l-.13.033c-.013-.236-.194-.19-.34-.203.005-.072.05-.092.095-.094a.474.474 0 01.159.022c.164.05.32.12.496.138.203.021.405.029.601-.015.265-.059.52-.149.707-.365.049-.056.083-.127.117-.195.019-.038.02-.084-.02-.116a1.397 1.397 0 00-.382-.217c.024.12-.031.182-.115.221 0 .014-.004.025 0 .03.08.115.084.16-.007.267a1.39 1.39 0 01-.218.211.477.477 0 01-.641-.05 1.36 1.36 0 01-.133-.152c-.078-.107-.076-.108-.033-.236-.165-.08-.128-.226-.104-.364.008-.05.028-.096.049-.163-.04.014-.067.017-.087.032a.897.897 0 00-.316.357c-.007.016-.01.034-.02.047-.012.015-.034.038-.045.035-.02-.006-.037-.027-.05-.045-.008-.012-.007-.032-.012-.057h-.126l.053-.172a14.82 14.82 0 00-.039-.049l.11-.284c-.06.026-.091.044-.124.051-.03.007-.064 0-.095 0 0-.031-.01-.07.004-.092.149-.22.305-.428.593-.476z"></path>
      <path d="M8.06 10.788c-.003-.038-.004-.075.037-.062.016.006.034.048.028.067-.01.04-.038.032-.064-.005z"></path>
      <path
        clipRule="evenodd"
        d="M11.981.009c.226-.012.453-.011.679 0 .247.01.495.024.74.062.401.064.798.157 1.19.273.463.138.92.299 1.356.511a7.31 7.31 0 012.948 2.642c.292.469.536.963.739 1.479.219.556.446 1.11.623 1.683.204.654.329 1.326.458 1.997.097.504.182 1.01.29 1.511.156.722.329 1.44.494 2.16.186.812.4 1.615.63 2.415.102.355.193.713.282 1.072.11.436.202.876.254 1.323.031.278.066.557.073.837a7.56 7.56 0 01-.017.88c-.037.413-.1.818-.226 1.212a5.017 5.017 0 01-.915 1.649l-.13.156.018.023c.043-.023.088-.041.127-.068.2-.138.373-.307.531-.49.4-.46.721-.973.975-1.529a3.59 3.59 0 00.325-1.72c-.024-.424-.097-.834-.3-1.213-.013-.027-.015-.06-.03-.121.05.035.082.048.101.072.107.13.22.258.315.398.33.494.46 1.052.486 1.64a3.75 3.75 0 01-.47 1.97c-.36.655-.887 1.14-1.526 1.506-.193.111-.394.21-.595.308-.157.078-.248.211-.318.365a.522.522 0 00-.033.406.359.359 0 01.013.139c-.005.077-.077.155-.14.162-.054.006-.125-.043-.15-.116a1.206 1.206 0 01-.06-.233c-.04-.314-.155-.6-.308-.87a3.906 3.906 0 00-.73-.91 2.129 2.129 0 00-.897-.524 4.093 4.093 0 00-.692-.131c-.075-.008-.15-.04-.22.01.18.06.363.11.538.18.434.173.82.43 1.18.728.308.255.58.543.794.884.098.155.186.315.227.496.027.123.042.25.067.375.013.062-.002.109-.053.144-.047.033-.122.034-.163-.01a.455.455 0 01-.08-.14c-.03-.073-.038-.159-.078-.225a7.314 7.314 0 00-1.423-1.664c-.16-.137-.329-.26-.537-.323-.376-.114-.753-.203-1.15-.154-.213.025-.427.032-.64.053a1.6 1.6 0 00-.736.278 5.14 5.14 0 00-.834.72c-.329.342-.642.699-.955 1.055-.136.155-.264.319-.314.531a5.227 5.227 0 00-.012.051.096.096 0 01-.09.076h-.31c-.046 0-.082-.048-.072-.094.023-.108.045-.216.07-.324.075-.325.19-.635.368-.917.024-.039.04-.088.104-.08l.01.049.027.077c.28-.435.571-.834.996-1.135.283-.204.584-.378.89-.55a.196.196 0 00-.098-.002c-.162.043-.325.084-.485.134-.402.124-.764.33-1.11.566-.147.1-.298.193-.414.333a7.314 7.314 0 00-1.07 1.767.845.845 0 00-.04.12.075.075 0 01-.072.056h-.494c-.04 0-.062-.051-.036-.082.123-.14.246-.282.377-.415.275-.281.58-.532.777-.884.027-.048.063-.09.095-.135.238-.333.54-.607.818-.902.082-.086.175-.16.26-.24.029-.027.053-.057.079-.085l-.018-.025-.135.041c-.034.017-.07.031-.102.05-.248.144-.494.292-.743.433-.408.23-.825.439-1.209.711-.281.2-.591.358-.889.533-.02.012-.044.015-.08.028-.015-.135.143-.201.108-.336-.033.014-.064.02-.085.038-.111.096-.227.19-.328.296-.148.157-.284.325-.425.488-.125.143-.25.286-.373.431A.153.153 0 019.89 24H8.762a.316.316 0 00.016-.042c.028-.09.085-.172.083-.28-.091-.018-.162.001-.212.077a4.45 4.45 0 00-.136.215c-.01.016-.024.03-.042.03h-.093c-.019 0-.029-.022-.017-.037.071-.088.14-.178.209-.268.001-.002-.006-.012-.012-.024-.014.004-.03.006-.045.013-.176.09-.352.181-.527.274a.363.363 0 01-.168.042H5.202c-.026 0-.039-.036-.019-.053.21-.178.402-.374.558-.605.335-.496.538-1.047.667-1.629.004-.02-.003-.043-.006-.091-.037.048-.059.072-.076.1a1.943 1.943 0 01-.334.415c-.28.258-.59.448-.983.464-.297.012-.588 0-.865-.127-.46-.21-.722-.57-.794-1.072-.025-.17-.017-.171-.182-.219A3.513 3.513 0 011.97 20.6a2.286 2.286 0 01-.808-1.13 3.569 3.569 0 01-.16-1.245c.002-.034.016-.067.024-.1.032.023.046.043.05.066.033.153.059.308.096.46.086.355.257.664.516.92.258.256.571.419.91.532.358.118.717.138 1.07-.016a1.89 1.89 0 00.621-.452c.328-.348.533-.76.648-1.223.009-.034.005-.071.007-.11-.015.006-.026.006-.03.011-.031.05-.064.1-.093.152-.284.502-.679.887-1.196 1.135-.351.17-.718.255-1.11.159a1.607 1.607 0 01-.971-.64 2.006 2.006 0 01-.368-.924 2.903 2.903 0 01.02-.886c.05-.439.466-1.17.742-1.271-.02.063-.035.112-.053.16-.043.116-.097.227-.13.345a1.901 1.901 0 00-.05.82c.033.212.09.416.204.6.147.236.346.407.62.465.11.023.225.014.338.018a.576.576 0 00.386-.131c.164-.128.282-.292.366-.481.168-.375.24-.777.309-1.179.05-.296.093-.594.133-.893.039-.281.071-.563.104-.845.026-.232.048-.464.074-.696.024-.228.052-.455.076-.683.024-.227.047-.455.069-.683.013-.14.022-.28.034-.42l.037-.417c.022-.25.041-.5.065-.748.008-.082-.02-.132-.09-.177a2.46 2.46 0 01-.492-.418c-.1-.109-.188-.228-.282-.342-.035-.042-.056-.097-.116-.118a2.084 2.084 0 00.275.597c.06.092.131.176.196.265.063.086.182.115.234.226-.028.003-.046.01-.06.006a4.74 4.74 0 01-.22-.057 2.71 2.71 0 01-1.287-.819c-.435-.487-.656-1.076-.71-1.723a5.206 5.206 0 01.014-1.06c.072-.602.22-1.186.45-1.745.155-.376.338-.741.526-1.102.205-.393.466-.75.765-1.076.512-.559 1.104-1.024 1.726-1.448.717-.49 1.478-.898 2.277-1.233C8.244.828 8.767.632 9.31.494c.655-.166 1.31-.33 1.982-.415.229-.03.458-.058.688-.07zm-1.847 22.82c-.07.06-.147.111-.207.18-.238.27-.464.549-.668.869l-.044.108a.177.177 0 00.093-.057c.174-.19.351-.378.519-.574.104-.122.195-.255.288-.386.024-.034.03-.08.046-.12l-.027-.02zm1.65-3.695a5.51 5.51 0 00-.653.593l-.37.386a.963.963 0 01-.377.25 1.372 1.372 0 01-.467.09c-.044 0-.087.006-.151.012.028.058.043.097.064.131.15.242.301.482.45.724.136.22.276.438.399.666.068.125.105.267.156.404.077.027.14-.018.202-.048.29-.135.579-.274.867-.412.213-.101.437-.186.636-.31.347-.215.68-.455 1.018-.685.015-.01.026-.028.042-.046-.023-.019-.038-.037-.056-.044-.287-.111-.527-.3-.77-.482a5.319 5.319 0 01-.506-.42 1.757 1.757 0 01-.41-.653c-.019-.049-.045-.095-.075-.156zm-5.847.264c-.06.096-.097.194-.132.293a3.38 3.38 0 01-.555 1.01c-.2.25-.455.412-.762.493-.23.06-.464.076-.7.07-.048-.002-.097.002-.158.005.016.04.021.066.035.085.1.145.23.246.4.295.157.046.316.034.498.023.181-.037.343-.115.485-.234.238-.199.402-.454.536-.732.175-.363.264-.751.342-1.144.01-.053.008-.11.011-.164zm14.945-4.586c.008.029.016.057.027.107.024.155.051.31.072.464.03.219.067.437.078.657.017.344.027.689-.014 1.033-.037.315-.063.633-.116.946a6.153 6.153 0 01-.46 1.518c-.008.018-.01.039-.02.082.047-.03.077-.042.098-.064.085-.083.17-.167.248-.255.271-.305.458-.66.596-1.043.18-.498.228-1.011.145-1.531-.103-.65-.33-1.263-.597-1.881a9.055 9.055 0 00-.024-.055l-.033.022zM5.797 8.29a.26.26 0 00.018.153c.124.251.25.501.379.75.025.049.066.09.03.163-.284.06-.578.119-.88.255.059.038.097.06.132.087.042.032.112.058.09.12-.01.033-.075.048-.117.072.017.01.043.021.067.036.166.102.33.207.447.368.138.192.229.404.188.644-.079.469-.306.85-.69 1.132-.054.04-.106.083-.161.122a.243.243 0 00-.103.245.77.77 0 00.055.195c.083.196.22.35.375.492.083.076.159.164.222.257a.37.37 0 01.025.377c-.023.05-.05.099-.076.148-.03.06-.028.111.022.162.041.042.08.089.112.138.038.058.078.079.147.05a.486.486 0 01.333-.006c.16.046.302.126.444.21.13.077.264.149.4.219.067.035.14.05.219.026.071-.022.124.01.145.076.02.064-.003.108-.074.139-.07.03-.137.063-.209.088-.1.035-.201.073-.314.077-.013-.107.11-.088.127-.159-.206-.126-.643-.145-.801-.034.063.112.035.21-.096.313-.13-.1-.025-.202.002-.3a.209.209 0 00-.249.17c-.015.101.067.216.178.224.108.007.218-.005.326-.012.06-.005.12-.027.199 0-.103.123-.248.127-.357.19.002.05.07.086.019.131-.053.048-.095-.001-.132-.03-.08-.063-.16-.126-.231-.197a.474.474 0 01-.157-.311.52.52 0 00-.043-.172c-.032-.074-.032-.137.033-.19-.018-.03-.028-.053-.045-.072a1.222 1.222 0 01-.196-.369c-.053-.137-.046-.264.048-.381.024-.03.05-.06.064-.095a.664.664 0 00.047-.168c.017-.165-.064-.287-.182-.387-.186-.156-.36-.322-.46-.551-.005-.011-.024-.017-.037-.026-.011.017-.024.027-.025.038-.019.185-.045.37-.052.557-.014.377.058.743.162 1.104.118.41.289.798.488 1.173.267.502.537 1.002.812 1.5.055.098.13.189.208.27.198.202.452.272.724.273.202 0 .404-.006.605-.026.295-.03.59-.073.884-.113.183-.025.365-.057.548-.08.21-.026.38.073.522.21.16.156.305.327.447.5.22.265.397.56.554.867.05.098.07.1.147.03.13-.121.26-.242.394-.36.067-.059.088-.12.067-.213a3.535 3.535 0 01-.085-.796c.002-.157.006-.314.018-.471.015-.224.03-.45.06-.672a59.114 59.114 0 01.362-2.298c.087-.493.182-.984.268-1.477.06-.347.118-.694.162-1.043.034-.273.055-.55.063-.825.011-.332.003-.665.002-.998 0-.077.004-.155-.01-.23-.028-.142-.01-.155-.162-.19a5.826 5.826 0 00-.607-.107c-.146-.018-.207-.053-.221-.19-.006-.049-.025-.098-.041-.146-.009-.025-.024-.048-.046-.09l-.025.264c-.009.096-.029.116-.127.115-.055 0-.11-.008-.164-.008-.476 0-.952-.008-1.426.032-.095.008-.173-.015-.226-.103-.04-.066-.088-.126-.134-.186-.063-.084-.086-.093-.182-.06-.195.068-.388.138-.582.21a2.71 2.71 0 00-.675.394.986.986 0 01-.323.168c-.033.01-.07.008-.127.013.02-.066.024-.114.047-.15.064-.105.135-.205.205-.306.023-.033.049-.063.073-.095l-.015-.023-.201.037c-.146.04-.296.07-.437.122-.148.053-.266.023-.386-.072a3.623 3.623 0 01-.733-.786l-.093-.132zm8.592 8.963l-.147.09c-.22.134-.44.266-.659.402-.093.058-.184.12-.27.188-.085.07-.124.161-.072.272.047.1.093.2.147.294.047.08.124.138.213.147.11.01.228.012.336-.012.217-.05.372-.205.528-.357a.291.291 0 00.087-.308c-.046-.18-.079-.365-.118-.547-.011-.052-.027-.103-.045-.169zm-.257-2.409c-.12.291-.205.597-.325.91-.151.433-.294.87-.435 1.323.036-.01.054-.01.067-.018.261-.16.522-.324.785-.484.054-.033.071-.078.065-.138-.012-.13-.024-.262-.034-.393l-.068-.886c-.008-.103-.02-.206-.029-.31-.009 0-.017-.002-.026-.004zm3.081-8.13l.099.285c.08.231.159.463.24.714l.58 1.952c.187.63.372 1.262.558 1.893.114.382.235.762.343 1.146.072.257.126.519.186.799.044.206.087.413.127.64.034.106.023.226.077.325l.025-.006-.068-.362c-.038-.206-.077-.412-.113-.638-.015-.07-.029-.141-.046-.211-.095-.396-.177-.796-.29-1.187-.196-.685-.413-1.364-.618-2.046-.165-.549-.322-1.1-.488-1.648-.069-.227-.15-.45-.226-.695l-.117-.336c-.037-.107-.075-.216-.115-.322-.04-.106-.084-.21-.127-.314a7.558 7.558 0 01-.027.01zM6.225 14.304c-.063-.001-.115.014-.134.083a.35.35 0 00.41.012 4.533 4.533 0 00-.276-.095zM5.23 11.98c-.026-.027-.057-.048-.075.002-.012.032-.007.07-.01.113.082-.037.082-.037.085-.115zm.062-1.189a.135.135 0 00-.088.056.197.197 0 00-.025.11c.005.152.01.306.026.457a.751.751 0 00.066.218c.061.136.157.167.288.101.055-.027.06-.054.025-.11a4.52 4.52 0 01-.129-.211c-.015-.068-.066-.131-.033-.207.04-.09-.076-.116-.074-.19V10.874c-.003-.038-.006-.087-.056-.083zm-.017-.968a.867.867 0 00-.467.127c-.076.045-.084.07-.05.158.034.087.07.173.115.254.064.117.09.125.21.077a.657.657 0 01.336-.053c.202.022.357.136.504.264l.092.077c.007-.006.014-.013.022-.018-.019-.105-.035-.226-.149-.264-.157-.053-.324-.075-.508-.117l-.24-.005c.24-.169.452-.044.687.009-.063-.115-.153-.147-.23-.193-.082-.05-.17-.092-.25-.144-.06-.037-.12-.08-.072-.172zm10.233.325c-.23-.01-.427.08-.608.211-.034.026-.06.065-.105.117.087.026.15.046.232.065.044-.015.088-.03.13-.046.306-.114.61-.115.904.031.126.063.237.04.366-.005-.02-.031-.03-.054-.045-.071a.986.986 0 00-.448-.273c-.14-.044-.284-.024-.426-.03zM7.99 6.483a.308.308 0 00.002.133c.08.321.156.643.242.962.104.387.27.75.456 1.103.02.037.061.08.098.087a.404.404 0 00.253-.051l-.472-.84c-.23-.448-.405-.92-.579-1.394zM10.397.497c-.2-.008-.405.004-.603.034-.236.035-.47.087-.7.152-.287.08-.569.18-.852.273-.04.013-.074.038-.11.058.028.014.05.018.07.014.287-.068.58-.085.873-.09.134-.002.269.009.402.025.19.024.382.048.57.09.456.104.874.3 1.265.556.464.306.888.66 1.257 1.078.205.232.395.475.56.739.17.274.315.561.449.856.273.601.456 1.232.6 1.876.04.173.07.348.1.524.017.104.065.167.17.19.122.028.2.105.22.251-.003.102-.06.174-.129.24a1.065 1.065 0 00-.268.358.164.164 0 00.083-.039c.08-.086.162-.172.235-.265a.56.56 0 00.13-.333c.009-.05.022-.1.024-.15.007-.124-.017-.15-.143-.168-.025-.004-.049-.014-.073-.015-.082-.007-.125-.063-.137-.131-.033-.198-.004-.355.247-.408.086-.018.174-.03.26-.042.158-.023.315-.053.473-.067.14-.012.19.033.226.167.008.029.018.057.021.087.019.179-.008.225-.141.288-.027.013-.055.024-.078.042a.148.148 0 00-.051.067c-.039.144.073.382.206.445l.673.32c.023.011.05.015.075.023l.018-.026c-.015-.008-.032-.013-.044-.024a2.27 2.27 0 00-.544-.32 4.898 4.898 0 00-.173-.075.203.203 0 01-.126-.191c-.003-.085.045-.154.128-.187l.059-.025c.099-.044.118-.076.112-.187a.384.384 0 00-.008-.063c-.067-.294-.123-.59-.205-.88a9.478 9.478 0 00-.826-2.036 7.465 7.465 0 00-1.39-1.805 4.536 4.536 0 00-1.177-.824 3.656 3.656 0 00-1.016-.328 6.155 6.155 0 00-.712-.074zm6.719 5.955c.01.014.018.028.038.034l-.022-.044-.016.01zM4.103 3.917a.062.062 0 01-.03.012.455.455 0 01-.04.039c-.01.01-.02.02-.045.04l-.363.354c-.088.085-.17.178-.266.253-.284.22-.425.53-.544.855a.132.132 0 00-.007.071c.013.055.033.108.052.168l.074.026c-.017.056-.03.105-.047.152-.058.164-.118.327-.175.491-.005.015.008.036.019.077.08-.175.158-.33.225-.489.228-.544.484-1.074.819-1.561.09-.133.182-.266.283-.401.004-.006.007-.013.022-.03.001-.016.003-.032.015-.04l.008-.017zm12.976 2.408a.023.023 0 01.009.019.073.073 0 00-.006.01.188.188 0 00.007.02l.018.022c.002-.007.007-.016.005-.021-.003-.01-.012-.018-.02-.038a1.331 1.331 0 01-.013-.012zM4.199 4.48c-.003.004-.008.008-.027.014-.005.013-.011.025-.031.047a2.085 2.085 0 01-.124.167c-.048.07-.116.055-.181.041-.134-.028-.228.016-.287.143-.089.187-.187.37-.273.56-.049.108-.11.216-.118.36.081.003.154.007.228.008h.228a2.563 2.563 0 01-.079.264c-.01.052-.022.103-.033.155l.02.004c.018-.046.037-.092.067-.153.066-.142.13-.285.2-.426.02-.04.034-.1.116-.092 0 .043.004.084 0 .124-.005.045-.017.09-.028.143.141.043.086.174.115.269.102-.022.104-.195.248-.144v.205l.017.002.439-1.059c-.13 0-.246-.02-.358.033-.024.011-.058-.001-.108-.004.075-.15.139-.278.211-.417a.128.128 0 01.025-.036c0-.015-.001-.03.008-.038l.006-.02c-.005.006-.01.011-.028.017-.004.012-.009.024-.026.045a.085.085 0 01-.032.033c-.123.157-.09.164-.258.106-.079-.027-.078-.028-.047-.144.028-.046.056-.093.098-.15 0-.016-.001-.032.007-.042L4.2 4.48zm2.073-.67c-.003.006-.007.011-.027.016-.094.125-.194.246-.28.377-.155.238-.301.481-.451.723-.14.224-.345.368-.575.481-.017.008-.04.006-.079.011.012-.059.016-.109.033-.153a6.076 6.076 0 01.229-.518l-.007-.02a.138.138 0 01-.035.025c-.028.05-.055.1-.093.164-.26.424-.443.817-.442.95.024.004.048.011.073.013.177.013.188.007.26-.165.03-.07.077-.12.147-.15l.175-.07c.044-.018.085-.057.146-.032.003.05-.01.11.014.145.042.062.044.125.047.193.002.049.017.098.026.147.029-.034.039-.065.05-.097.142-.39.277-.782.428-1.17.1-.256.22-.504.33-.756.013-.03.013-.067.03-.092V3.81zm3.987-.34c0 .045.01.084.021.123.042.16.094.318.124.48.024.133.023.27.028.406 0 .033-.019.067-.032.11-.094-.058-.047-.158-.106-.215h-.125c-.015.072-.01.152-.046.2-.066.085-.155.154-.236.227-.043.038-.078.018-.103-.025l-.046-.087c-.065.035-.117.069-.172.093-.116.051-.235.095-.35.147-.085.038-.09.053-.07.147.014.075.034.148.047.223.013.072.05.109.123.124.233.05.462.115.657.265.058-.102.058-.102.168-.151.03-.014.06-.03.092-.042.08-.03.115-.017.15.06.023.048.041.098.066.158.06-.14-.042-.267.017-.416.157.18.24.39.375.567a.235.235 0 00.022-.098c.002-.124 0-.247.002-.371 0-.034.013-.067.02-.1l.032-.003c.11.155.13.354.226.52a3.036 3.036 0 00-.01-.392c-.004-.045 0-.074.05-.088.08.036.116.14.215.158-.03-.275-.423-1.137-.798-1.635-.114-.127-.2-.28-.34-.386zm-2.667.696c-.019.034-.03.05-.037.067-.061.185-.125.37-.18.556-.031.105-.087.169-.195.19-.09.019-.178.052-.268.073-.038.009-.089.015-.118-.003-.024-.016-.025-.069-.036-.106-.064.076-.082.087-.17.047-.133-.062-.262-.135-.393-.201-.048-.025-.093-.063-.17-.03-.043.12-.091.25-.137.382-.099.28-.087.242.095.453.046.048.102.03.154.023.054-.009.106-.03.16-.036.13-.013.26-.08.367-.015.204-.064.387-.122.571-.178.05-.015.089.005.114.054.022.042.034.093.082.121.038-.056-.013-.128.063-.178l.14.241-.042-1.46zm.278.358c-.096-.01-.107.01-.11.108-.002.038-.003.078.002.115.03.2.099.386.174.57.002.006.012.01.022.015l.078-.05c.052.036.081.088.153.088.205-.002.41.014.616.012.099-.001.158.042.205.12.018.03.024.077.088.066l-.08-.394c-.05-.195-.085-.395-.172-.589-.057.057-.114.068-.18.046a.72.72 0 00-.135-.028c-.22-.028-.44-.059-.66-.08zm10.254-1.727c.089.163.155.316.139.491-.016.168.026.342-.044.516-.047-.033-.088-.082-.112-.075-.117.035-.164-.057-.227-.115a4.772 4.772 0 01-.286-.29l-.104-.113a4.856 4.856 0 01-.023.019c.035.046.07.093.11.156.04.064.084.127.122.193.034.058.065.118.031.205-.082-.01-.164-.019-.246-.032-.06-.01-.101 0-.124.07-.031.098-.037.096-.15.09.02.042.036.08.057.116.041.074.03.138-.03.196-.06.06-.118.122-.178.181a.175.175 0 01-.185.046c-.222-.061-.447-.113-.67-.174-.032-.009-.063-.04-.086-.068-.03-.04-.052-.087-.08-.13-.044-.07-.09-.138-.136-.207a.18.18 0 00-.014.105c.012.127.03.253.035.38.005.1-.024.12-.121.104-.104-.017-.206-.04-.31-.058-.064-.012-.131-.028-.202.03l.081.208c.09 0 .166-.01.237.002a.819.819 0 01.458.251c.078.083.154.168.241.26l.018-.005c-.004-.006-.008-.013-.01-.04.014-.056-.062-.118.018-.178.031.03.064.057.088.09.058.078.111.159.169.257l.089.141.024-.013a2093.819 2093.819 0 01-.427-.934c.055.007.083.007.108.016.193.07.385.142.577.216.074.028.147.06.219.094.062.028.112.018.157-.033.05-.056.102-.112.154-.167.05-.051.095-.046.132.014.016.025.026.053.04.08.071.138.143.277.217.433l.159.308.025-.011c-.044-.106-.07-.218-.138-.334-.057-.182-.168-.346-.206-.545.136.034.362.326.567.732l.057.074.018-.011a1.563 1.563 0 01-.052-.127c-.046-.145-.097-.29-.136-.436-.022-.083-.036-.173.022-.26l.109.058-.026-.207.027-.016c.022.02.05.036.065.06.073.108.143.22.215.33.01.016.029.029.043.043-.036-.217-.2-.38-.229-.626l.155.112c.014-.166.012-.319.042-.465.032-.158-.023-.297-.063-.445.024.004.036.006.055.025.092.124.183.249.277.371.02.027.05.047.069.087l.04.063.019-.015a.293.293 0 01-.053-.082 27.922 27.922 0 01-.332-.49c-.221-.311-.363-.467-.485-.521zm-6.57.327c-.003.161.092.275.069.415l-.368.087c.09.139.032.237-.052.331-.05.057-.092.122-.143.178-.037.04-.046.078-.018.126l.16.275c.029.048.072.066.128.064.076-.003.152 0 .228-.001.116-.003.216.022.275.137.006.014.02.024.044.052.004-.059-.003-.098.01-.13.016-.04.04-.099.072-.108.084-.023.173-.024.26-.03.013-.001.027.018.04.029l.071.065c.019-.11-.082-.198-.024-.31l.126.04c-.026-.123-.07-.245-.071-.366 0-.123.051-.243.115-.36.107.062.16.156.234.253.183.265.36.533.494.834.165-.078.27.068.407.088-.003-.106-.133-.441-.197-.492a.142.142 0 00-.102-.028c-.06.011-.119.039-.191.063-.025-.039-.056-.078-.077-.122a3.936 3.936 0 00-.473-.783c-.076-.094-.16-.182-.228-.26l-.391.285c-.049.035-.094.03-.132-.017l-.169-.207c-.025-.03-.053-.059-.097-.108z"
      ></path>
    </svg>
  );
}

function OmpMark() {
  // Compact "O" with an inset square — distinct from Pi's block mark.
  return (
    <svg className="size-[22px]" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" />
    </svg>
  );
}

function CopyMark() {
  return (
    <svg className="size-[14px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 15.5V6.8C5 5.8 5.8 5 6.8 5h8.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckMark() {
  return (
    <svg className="size-[14px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.2 4L19 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy command failed");
  } finally {
    document.body.removeChild(textarea);
  }
}

function formatReleaseAge(publishedAt: string | undefined) {
  if (!publishedAt) return null;
  const timestamp = new Date(publishedAt).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < week) return `${Math.floor(diffMs / day)}d ago`;
  return `${Math.floor(diffMs / week)}w ago`;
}
