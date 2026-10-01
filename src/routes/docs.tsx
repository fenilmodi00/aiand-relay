import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Link as LinkIcon, Search } from "lucide-react";
import { ProviderBrand } from "../components/ProviderBrand";
import {
  ClaudeMark,
  CodexMark,
  OpenCodeMark,
  PiMark,
  PrimeMark,
  HermesMark,
  DeepSeekMark,
  GrokMark,
  UnrealMark,
  OmpMark,
} from "../components/ProviderBrand";
import { pageHead, siteUrl, structuredData } from "../lib/seo";
import "../styles/landing.css";
import "../styles/docs.css";

const npmInstall = "npm install -g @aiand/cli";
const curlInstall =
  "curl -fsSL https://raw.githubusercontent.com/aiandlabs/aiand-cli/main/install.sh | bash";
const psInstall = "irm https://raw.githubusercontent.com/aiandlabs/aiand-cli/main/install.ps1 | iex";
const githubUrl = "https://github.com/aiandlabs/aiand-cli";
const consoleUrl = "https://console.aiand.com";
const integrationsUrl = "https://docs.aiand.com/integrations";
const codexGuideUrl = "https://docs.aiand.com/integrations/codex/";
const llmsUrl = "https://docs.aiand.com/llms.txt";

export const Route = createFileRoute("/docs")({
  component: Docs,
  head: () => ({
    ...pageHead(
      "Documentation | ai& CLI",
      "Connect OpenCode, Claude Code and Codex to ai& inference. Install, sign in, wire agents, run prompts, and troubleshoot the aiand CLI.",
      "/docs",
    ),
    scripts: [
      structuredData({
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: "ai& CLI documentation",
        url: `${siteUrl}/docs`,
        description:
          "Installation, sign-in, agent wiring, commands, prompts, logs, configuration, and troubleshooting for the aiand CLI.",
        about: { "@type": "SoftwareApplication", name: "aiand CLI", url: `${siteUrl}/` },
      }),
      structuredData({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "Documentation", item: `${siteUrl}/docs` },
        ],
      }),
    ],
  }),
});

/** Section ids drive both the sidebar and the scroll-spy highlight. */
const sections = [
  { id: "what-it-does", label: "What it does" },
  { id: "install", label: "Install" },
  { id: "signing-in", label: "Signing in" },
  { id: "agents", label: "Coding agents" },
  { id: "commands", label: "Commands" },
  { id: "running-prompts", label: "Running prompts" },
  { id: "logs-usage", label: "Logs & usage" },
  { id: "configuration", label: "Configuration" },
  { id: "profiles", label: "Profiles" },
  { id: "exit-codes", label: "Exit codes" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "for-agents", label: "For AI agents" },
];

const commandRows: Array<[string, string]> = [
  ["aiand login / logout", "Start or end this machine's session."],
  ["aiand whoami", "Identity, organization, and key expiry."],
  ["aiand status", "Sign-in state plus every agent's wiring."],
  ["aiand <agent> on | off | status", "Wire a coding agent to ai&, unwire it, or check its wiring."],
  ["aiand init", "Detect installed agents and wire them in one go."],
  ["aiand run-agent <agent>", "Run an agent on ai& for one session only; nothing is written."],
  ["aiand restore <agent> --force", "Put an agent's config back as it was before aiand touched it."],
  ["aiand run <prompt>", "One prompt, streamed to stdout."],
  ["aiand chat", "Interactive conversation."],
  ["aiand models", "The model catalog, with prices in your billing currency."],
  ["aiand logs", "Recent requests, with --follow."],
  ["aiand usage", "Requests and tokens, compared with the previous period."],
  ["aiand orgs", "Organizations you belong to."],
  ["aiand config", "Profiles and defaults."],
  ["aiand key export", "Print the active key, for piping into another tool."],
];

const exitRows: Array<[string, string]> = [
  ["0", "Success."],
  ["1", "Request or usage error (the message says which)."],
  ["2", "Not signed in, or the session could not be refreshed."],
  ["3", "Sign-in denied, or the code expired."],
  ["70", "A bug in aiand; the stack trace is printed, please report it."],
  ["127", "Unknown command, or the agent is not installed."],
  ["130", "Interrupted (Ctrl-C)."],
];

const envVars: Array<[string, ReactNode]> = [
  [
    "AIAND_API_KEY",
    <>
      Use this key; no login, nothing stored.
    </>,
  ],
  ["AIAND_PROFILE", <>Profile to use.</>],
  [
    "AIAND_BASE_URL",
    <>
      API endpoint (default <Code>https://api.aiand.com</Code>).
    </>,
  ],
  ["AIAND_AUTH_URL", <>Sign-in endpoint, if different from the API.</>],
  ["AIAND_CONFIG_DIR", <>Where config and credentials live.</>],
  [
    "AIAND_HOME",
    <>Home directory to find agent configs in (e.g. your Windows home from WSL).</>,
  ],
  [
    "AIAND_KEY_STORAGE",
    <>
      <Code>keychain</Code>, <Code>file</Code>, or <Code>plaintext</Code>.
    </>,
  ],
  [
    "AIAND_SECRET_STORE_MASTER_KEY",
    <>64 hex characters; your own key for the encrypted file.</>,
  ],
  ["AIAND_NO_BROWSER=1", <>Never open a browser; print the sign-in link instead.</>],
  [
    "AIAND_UPDATE_CHECK=0",
    <>
      Turn off the daily update notice (<Code>NO_UPDATE_CHECK=1</Code> also works).
    </>,
  ],
  ["NO_COLOR", <>Turn off color.</>],
];

function Docs() {
  const [active, setActive] = useState(sections[0]!.id);

  const [query, setQuery] = useState("");
  const filteredSections = sections.filter((section) =>
    section.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const current = [...sections].reverse().find(({ id }) => {
        const element = document.getElementById(id);
        return element && element.getBoundingClientRect().top <= 150;
      });
      setActive(current?.id ?? sections[0].id);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="relay-home docs-page">
      <div className="page-grid-lines" aria-hidden="true" />
      <a className="skip-link" href="#docs-content">
        Skip to documentation
      </a>
      <header className="relay-nav-container docs-header">
        <div className="relay-nav wrap">
          <a className="relay-brand" href="/" aria-label="ai& CLI home">
            <img src="/aiandrelay-logo.svg" alt="ai& Relay" width="36" height="36" />
            <span>
              <b>ai& CLI</b>
            </span>
          </a>
          <nav aria-label="Main navigation">
            <a href="/">Home</a>
            <a href={githubUrl} target="_blank" rel="noopener noreferrer">
              GitHub <ArrowUpRight size={14} />
            </a>
            <a className="button button-dark" href="#install">
              Quick start <ArrowUpRight size={14} />
            </a>
          </nav>
        </div>
      </header>
      <div className="docs-layout wrap">
        <aside className="docs-sidebar">
          <div className="docs-sidebar-inner">
            <a className="docs-back" href="/">
              Home / <strong>Documentation</strong>
            </a>
            <label className="docs-search">
              <Search size={16} />
              <input
                type="search"
                placeholder="Find a section"
                aria-label="Find a documentation section"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <p className="eyebrow">DOCUMENTATION</p>
            <nav aria-label="Documentation sections">
              {filteredSections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={active === section.id ? "location" : undefined}
                >
                  {section.label}
                </a>
              ))}
              {filteredSections.length === 0 && (
                <p className="docs-no-results" role="status">
                  No matching sections.
                </p>
              )}
            </nav>
            <div className="docs-sidebar-links">
              <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                GitHub <ArrowUpRight size={14} />
              </a>
              <a href={llmsUrl} target="_blank" rel="noopener noreferrer">
                llms.txt <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </aside>
        <main id="docs-content" className="docs-content">
          <div className="docs-mobile-nav">
            <label htmlFor="docs-jump">On this page</label>
            <select
              id="docs-jump"
              value={active}
              onChange={(event) => {
                window.location.hash = event.target.value;
                setActive(event.target.value);
              }}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </div>
          <div className="docs-intro">
            <p className="eyebrow">
              <span className="relay-name">AIAND CLI</span> / DOCS
            </p>
            <h1>Documentation</h1>
            <p>
              Connect OpenCode, Claude Code and Codex to ai& inference. ai& CLI
              handles sign-in and configuration, so you can get straight to building.
            </p>
            <div className="docs-provider-row">
              <ProviderBrand />
            </div>
            <div className="docs-quick-links">
              <a href="#install">
                Install & sign in <ArrowUpRight size={14} />
              </a>
              <a href="#commands">
                Command reference <ArrowUpRight size={14} />
              </a>
              <a href="#troubleshooting">
                Troubleshooting <ArrowUpRight size={14} />
              </a>
            </div>
          </div>

          <Section id="what-it-does" title="What it does">
            <P>
              aiand CLI wires your coding agents to ai& inference. Sign in once
              through your browser, run one command per agent, and your tools send
              their requests through ai& - with the model catalog and prices in
              your billing currency.
            </P>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Card title="Sign in through your browser">
                Get started without copying API keys. Approving creates an API key
                for your organization, labeled so you can tell machines apart.
              </Card>
              <Card title="Keep your settings">
                Wiring preserves your existing providers and chosen model, and{" "}
                <Code>off</Code> removes exactly what aiand added.
              </Card>
              <Card title="See models and prices">
                Explore the catalog in your billing currency, and track requests
                across your whole organization.
              </Card>
            </div>
          </Section>

          <Section id="install" title="Install">
            <P>Requires Node.js 22 or newer.</P>
            <CopyBox className="mt-4" text={npmInstall} />
            <P className="mt-5">Or with the installer script:</P>
            <CopyBox className="mt-3" text={curlInstall} />
            <CopyBox className="mt-3" text={psInstall} />
            <Callout>
              The installer will modify your shell. Set{" "}
              <Code>AIAND_NO_MODIFY_PATH=1</Code> to skip permanent PATH changes
              while still adding the CLI to the installer&apos;s process PATH. To
              update the CLI, run the install command again.
            </Callout>
            <P className="mt-5">Then sign in and wire an agent:</P>
            <CopyBox className="mt-3" text="aiand login" />
            <CopyBox className="mt-3" text="aiand opencode on" />
            <CopyBox className="mt-3" text="opencode" />
          </Section>

          <Section id="signing-in" title="Signing in">
            <P>
              <Code>aiand login</Code> opens your browser. Approving creates an API
              key for your organization, labeled <Code>aiand@&lt;hostname&gt;</Code>{" "}
              so you can tell your machines apart in the{" "}
              <Link href={consoleUrl}>console</Link>.
            </P>
            <P className="mt-4">
              If the browser sign-in cannot finish (no browser, a timeout, or a
              script with no terminal), aiand switches to a device code you approve
              from any device:
            </P>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-code px-4 py-3 font-mono text-[13px] leading-relaxed text-muted">
              <code>{`  Your code   BCDF-GHJK
  Approve at  https://api.aiand.com/auth/device?user_code=BCDF-GHJK`}</code>
            </pre>
            <P className="mt-5">Already have a key from the console?</P>
            <CopyBox className="mt-3" text="aiand login --paste" />
            <CopyBox className="mt-3" text="aiand login --with-token < key.txt" />
            <P className="mt-5">
              <Code>aiand logout</Code> offers to revoke a key that{" "}
              <Code>login</Code> created. A key you pasted in is only removed from
              this machine; revoke it in the console.
            </P>
            <Callout>
              Where the key lives: the OS keychain when there is one, otherwise an
              encrypted file under <Code>~/.config/aiand/</Code>. The encrypted
              file keeps its key right next to it, so it guards against a casual
              look, not against anyone who can read that directory.{" "}
              <Code>AIAND_KEY_STORAGE=plaintext</Code> stores it as a plain
              owner-only file if you ask for that. <Code>aiand status</Code> shows
              which one you have.
            </Callout>
            <P className="mt-4">
              Keys last 30 days and rotate automatically during their last 3 days,
              or right away if the server rejects one. When your key rotates, aiand
              updates the agents it wired, so they keep working without another{" "}
              <Code>on</Code>.
            </P>
            <P className="mt-4">
              <strong>CI and scripts:</strong> skip <Code>login</Code> and set{" "}
              <Code>AIAND_API_KEY</Code>. Nothing is written to disk.
            </P>
            <CopyBox className="mt-3" text="AIAND_API_KEY=... aiand run-agent opencode" />
          </Section>

          <Section id="agents" title="Coding agents">
            <P>
              aiand supports{" "}
              <Link href="https://opencode.ai">OpenCode</Link>,{" "}
              <Link href="https://code.claude.com/docs">Claude Code</Link> and{" "}
              <Link href="https://developers.openai.com/codex/cli">Codex</Link>.
              Run <Code>aiand init</Code> to detect installed agents and wire them
              in one go, or wire each one yourself. Per-agent guides live at{" "}
              <Link href={integrationsUrl}>docs.aiand.com/integrations</Link>.
            </P>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Card title="OpenCode">
                <span className="flex items-center gap-2">
                  <OpenCodeMark /> route OpenCode through ai&
                </span>
              </Card>
              <Card title="Claude Code">
                <span className="flex items-center gap-2">
                  <ClaudeMark /> route Claude Code through ai&
                </span>
              </Card>
              <Card title="Codex">
                <span className="flex items-center gap-2">
                  <CodexMark /> write an ai& profile for Codex
                </span>
              </Card>
            </div>
            <h3 className="mt-6 text-[17px] font-semibold text-ink">OpenCode</h3>
            <CopyBox className="mt-3" text="aiand opencode on" />
            <CopyBox className="mt-3" text="aiand opencode status" />
            <CopyBox className="mt-3" text="aiand opencode off" />
            <CopyBox className="mt-3" text="aiand run-agent opencode" />
            <P className="mt-4">
              <Code>on</Code> adds an <Code>aiand</Code> provider to{" "}
              <Code>~/.config/opencode/opencode.json</Code>, with the models from
              the live catalog, so plain <Code>opencode</Code> uses ai&
              afterwards. Your other providers and your own edits are left alone.
              If you already chose a model it stays chosen; pass{" "}
              <Code>--model &lt;id&gt;</Code> to switch, or{" "}
              <Code>--model native</Code> to keep OpenCode&apos;s own default.
            </P>
            <P className="mt-3">
              <Code>off</Code> removes only what aiand wrote. If a config ever ends
              up in a state you do not want,{" "}
              <Code>aiand restore opencode --force</Code> puts back the exact file
              from before aiand first touched it.
            </P>
            <h3 className="mt-6 text-[17px] font-semibold text-ink">Claude Code</h3>
            <CopyBox className="mt-3" text="aiand claude on" />
            <CopyBox className="mt-3" text="aiand claude status" />
            <CopyBox className="mt-3" text="aiand claude off" />
            <CopyBox className="mt-3" text="aiand run-agent claude" />
            <P className="mt-4">
              <Code>on</Code> writes an <Code>env</Code> block into{" "}
              <Code>~/.claude/settings.json</Code> (or{" "}
              <Code>$CLAUDE_CONFIG_DIR/settings.json</Code>): the gateway URL, your
              key, and a catalog model for every slot. The main slots get a vision
              model unless your profile names a model; background work (the{" "}
              <Code>haiku</Code> slot) gets a fast one. Pass{" "}
              <Code>--model &lt;id&gt;</Code> to switch the main slots.
            </P>
            <P className="mt-3">
              A <Code>model</Code> setting ai& cannot serve is set aside until{" "}
              <Code>off</Code>; one it can serve is kept, and Claude Code starts on
              it. Claude Code&apos;s context budget is capped at 200k tokens, so
              long sessions compact before open models start to degrade.{" "}
              <Code>/model</Code> lists every ai& model: Claude Code only discovers
              gateway models whose id contains &quot;claude&quot;, so{" "}
              <Code>on</Code> writes them into its <Code>modelPicker</Code>{" "}
              setting. The Bedrock, Vertex and Foundry switches are written as{" "}
              <Code>0</Code>, so one left on elsewhere cannot route Claude Code
              away from ai&. WebSearch is denied because it runs on
              Anthropic&apos;s servers; WebFetch still works.
            </P>
            <Callout>
              The key sits in that file while Claude Code is wired, so keep it out
              of a dotfiles repo, and Claude Code passes it to every command and
              hook it runs, as it does every <Code>env</Code> value. A
              project&apos;s own <Code>.claude/settings.json</Code> can override
              these values.
            </Callout>
            <h3 className="mt-6 text-[17px] font-semibold text-ink">Codex</h3>
            <CopyBox className="mt-3" text="aiand codex on" />
            <CopyBox className="mt-3" text="codex --profile aiand" />
            <CopyBox className="mt-3" text="aiand codex status" />
            <CopyBox className="mt-3" text="aiand codex off" />
            <CopyBox className="mt-3" text="aiand run-agent codex" />
            <P className="mt-4">
              <Code>on</Code> writes a separate profile,{" "}
              <Code>~/.codex/aiand.config.toml</Code> (or{" "}
              <Code>$CODEX_HOME/aiand.config.toml</Code>), and leaves your{" "}
              <Code>config.toml</Code> alone, so plain <Code>codex</Code> keeps
              your usual setup and <Code>codex --profile aiand</Code> uses ai&.
              The profile never holds your key: Codex runs{" "}
              <Code>aiand key export</Code> for your active aiand profile, so a
              rotation or <Code>aiand config use</Code> needs nothing.
            </P>
            <P className="mt-3">
              It pins a reasoning level the model publishes, for Plan Mode too, and
              turns off Codex&apos;s hosted tools (web search, image generation
              and the like), which ai& does not run. A model or level you pick in
              Codex&apos;s <Code>/model</Code> stays across another{" "}
              <Code>on</Code>; pass <Code>--model &lt;id&gt;</Code> to switch.
              Settings of your own in the profile survive <Code>on</Code> and{" "}
              <Code>off</Code>. <Code>on</Code> refuses a profile that already
              routes Codex elsewhere; <Code>--force</Code> takes it over, and{" "}
              <Code>aiand restore codex --force</Code> brings the old one back.
              Your <Code>config.toml</Code> still loads under the profile, so its
              MCP servers and plugins come along. Which Codex versions work with
              ai&, and what changed between them, is in the{" "}
              <Link href={codexGuideUrl}>Codex guide</Link>.
            </P>
            <h3 className="mt-6 text-[17px] font-semibold text-ink">Upcoming agents</h3>
            <P>
              Pi, Prime, Hermes, DeepSeek, Grok, Unreal and omp are not wired by
              the CLI yet. They are kept visible as upcoming — same{" "}
              <Code>on / off / status</Code> pattern when they land. Nothing to
              install for them today.
            </P>
            <Table head={["Agent", "Status", "Command"]}>
              {[
                ["Pi Code", <PiMark key="pi" />, "aiand pi on"],
                ["Prime Agent", <PrimeMark key="prime" />, "aiand prime on"],
                ["Hermes Agent", <HermesMark key="hermes" />, "aiand hermes on"],
                ["DeepSeek", <DeepSeekMark key="deepseek" />, "aiand deepseek on"],
                ["Grok Build", <GrokMark key="grok" />, "aiand grok on"],
                ["Unreal Agent", <UnrealMark key="unreal" />, "aiand unreal on"],
                ["omp", <OmpMark key="omp" />, "aiand omp on"],
              ].map(([name, mark, cmd]) => (
                <Row key={name as string}>
                  <Cell strong>
                    <span className="flex items-center gap-2">
                      <span className="flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4 [&>img]:h-4 [&>img]:w-4">
                        {mark as ReactNode}
                      </span>
                      {name as string}
                    </span>
                  </Cell>
                  <Cell>Upcoming</Cell>
                  <Cell>
                    <Code>{cmd as string}</Code>
                  </Cell>
                </Row>
              ))}
            </Table>
          </Section>

          <Section id="commands" title="Commands">
            <Table head={["Command", "What it does"]}>
              {commandRows.map(([cmd, what]) => (
                <Row key={cmd}>
                  <Cell>
                    <Code>{cmd}</Code>
                  </Cell>
                  <Cell>{what}</Cell>
                </Row>
              ))}
            </Table>
            <Callout>
              Most commands take <Code>--json</Code>, and every command takes{" "}
              <Code>--help</Code>.
            </Callout>
          </Section>

          <Section id="running-prompts" title="Running prompts">
            <P>Prefer a quick prompt?</P>
            <CopyBox
              className="mt-3"
              text={'git diff | aiand run "Review this diff. Be ruthless."'}
            />
            <CopyBox className="mt-3" text={'aiand run "why is the sky blue?"'} />
            <CopyBox className="mt-3" text={'cat main.ts | aiand run "review this file"'} />
            <CopyBox
              className="mt-3"
              text={
                'aiand run -m deepseek-ai/deepseek-v4-flash --system "be terse" "summarize CAP theorem"'
              }
            />
            <CopyBox className="mt-3" text={'aiand run --no-stream --json "hello" | jq .usage'} />
            <P className="mt-5">
              Piped input is added to the prompt. The answer goes to stdout and
              everything else to stderr, so <Code>aiand run … &gt; out.md</Code>{" "}
              saves just the answer.
            </P>
            <P className="mt-3">
              After each answer, a dim footer shows the model, tokens, cost, time,
              and request ID (<Code>-q</Code> hides it). Cost and timing usually
              appear only with <Code>--no-stream</Code>:
            </P>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-code px-4 py-3 font-mono text-[13px] leading-relaxed text-muted">
              <code>{`deepseek-ai/deepseek-v4-flash  ·  9 in / 21 out  ·  0.00000660 USD  ·  181ms  ·  919a9aa4…`}</code>
            </pre>
            <P className="mt-4">
              Without <Code>-m</Code>, aiand uses your profile&apos;s model, or the
              recommended default from the catalog. <Code>-m auto</Code> lets ai&
              pick per request, where your account supports it. Set a default with{" "}
              <Code>aiand config set model &lt;id&gt;</Code>.
            </P>
            <Callout>
              If a reasoning model spends its whole budget thinking, aiand tells
              you so and suggests raising <Code>--max-tokens</Code>, rather than
              printing a blank line.
            </Callout>
            <P className="mt-4">Or start an interactive conversation:</P>
            <CopyBox className="mt-3" text="aiand chat" />
          </Section>

          <Section id="logs-usage" title="Logs & usage">
            <P>
              Both cover your whole organization, not just this machine. See the
              same data in the <Link href={consoleUrl}>console</Link>.
            </P>
            <CopyBox className="mt-4" text="aiand logs --range 1h --errors" />
            <CopyBox className="mt-3" text="aiand logs --follow" />
            <CopyBox className="mt-3" text="aiand usage --range 30days" />
            <CopyBox className="mt-3" text="aiand usage --metrics" />
            <Table head={["Command", "What it does"]}>
              <Row>
                <Cell>
                  <Code>aiand logs --range 1h --errors</Code>
                </Cell>
                <Cell>Only failed requests in the last hour.</Cell>
              </Row>
              <Row>
                <Cell>
                  <Code>aiand logs --follow</Code>
                </Cell>
                <Cell>Tail new requests as they arrive.</Cell>
              </Row>
              <Row>
                <Cell>
                  <Code>aiand usage --range 30days</Code>
                </Cell>
                <Cell>Requests and tokens for the last 30 days.</Cell>
              </Row>
              <Row>
                <Cell>
                  <Code>aiand usage --metrics</Code>
                </Cell>
                <Cell>Full usage breakdown.</Cell>
              </Row>
            </Table>
          </Section>

          <Section id="configuration" title="Configuration">
            <CopyBox className="mt-4" text="aiand config" />
            <CopyBox className="mt-3" text="aiand config set model deepseek-ai/deepseek-v4-flash" />
            <CopyBox className="mt-3" text="aiand config path" />
            <P className="mt-5">
              Settings live in <Code>~/.config/aiand/config.json</Code> (or under{" "}
              <Code>$XDG_CONFIG_HOME</Code>). Credentials are kept in a separate
              file, so the config is safe to share.
            </P>
            <P className="mt-3">
              Flags win over environment variables, which win over the stored
              profile.
            </P>
            <Table head={["Variable", "Effect"]}>
              {envVars.map(([name, effect]) => (
                <Row key={name}>
                  <Cell>
                    <Code>{name}</Code>
                  </Cell>
                  <Cell>{effect}</Cell>
                </Row>
              ))}
            </Table>
          </Section>

          <Section id="profiles" title="Profiles">
            <P>
              Profiles keep separate sign-ins, so <Code>--profile work</Code> and{" "}
              <Code>--profile personal</Code> can use different organizations at
              the same time.
            </P>
            <CopyBox className="mt-4" text="aiand config profiles" />
            <CopyBox className="mt-3" text="aiand config use work" />
            <CopyBox className="mt-3" text="aiand --profile work status" />
            <Callout>
              Codex pins a profile with <Code>on --profile &lt;name&gt;</Code>, and
              otherwise follows your active profile through{" "}
              <Code>aiand key export</Code> - a rotation or{" "}
              <Code>aiand config use</Code> needs nothing.
            </Callout>
          </Section>

          <Section id="exit-codes" title="Exit codes">
            <Table head={["Code", "Meaning"]}>
              {exitRows.map(([code, meaning]) => (
                <Row key={code}>
                  <Cell>
                    <Code>{code}</Code>
                  </Cell>
                  <Cell>{meaning}</Cell>
                </Row>
              ))}
            </Table>
            <Callout>
              <Code>aiand status</Code> exits <Code>0</Code> when signed in, even if
              ai& cannot be reached to check the key (<Code>reachable: false</Code>{" "}
              in <Code>--json</Code>), and <Code>1</Code> only when signed out.
              Scripts that gate on it keep working during an outage.
            </Callout>
          </Section>

          <Section id="troubleshooting" title="Troubleshooting">
            <details className="docs-faq">
              <summary>Browser sign-in cannot finish</summary>
              <P>
                If there is no browser, a timeout, or a script with no terminal,
                aiand switches to a device code you approve from any device. To
                skip the browser up front, set <Code>AIAND_NO_BROWSER=1</Code> and
                approve at the printed link. On a headless machine, prefer{" "}
                <Code>AIAND_API_KEY</Code> instead of an interactive login.
              </P>
              <CopyBox text="AIAND_NO_BROWSER=1 aiand login" />
            </details>
            <details className="docs-faq">
              <summary>Command not found after installation, or Node version errors</summary>
              <P>
                aiand CLI requires Node.js 22 or newer - check with{" "}
                <Code>node --version</Code> and upgrade if needed. If your shell
                cannot find <Code>aiand</Code> after the installer script, open a
                new terminal so it picks up the PATH change, or set{" "}
                <Code>AIAND_NO_MODIFY_PATH=1</Code> behavior aside and add the
                install directory to PATH yourself.
              </P>
              <CopyBox text="node --version" />
            </details>
            <details className="docs-faq">
              <summary>Requests fail after a key rotation</summary>
              <P>
                Keys last 30 days and rotate automatically during their last 3
                days, or right away if the server rejects one. Agents aiand wired
                are updated on rotation - run <Code>aiand status</Code> to confirm
                the session, and re-run <Code>aiand &lt;agent&gt; on</Code> if an
                agent was wired outside aiand.
              </P>
              <CopyBox text="aiand status" />
              <CopyBox text="aiand whoami" />
            </details>
            <details className="docs-faq">
              <summary>An agent config ended up in a state you do not want</summary>
              <P>
                <Code>aiand &lt;agent&gt; off</Code> removes exactly what aiand
                added. If that is not enough,{" "}
                <Code>aiand restore &lt;agent&gt; --force</Code> puts back the exact
                file from before aiand first touched it. Use{" "}
                <Code>aiand &lt;agent&gt; status</Code> first to see what is
                actually configured.
              </P>
              <CopyBox text="aiand opencode status" />
              <CopyBox text="aiand restore opencode --force" />
            </details>
          </Section>

          <Section id="for-agents" title="For AI agents">
            <P>
              An LLM-readable doc is published at{" "}
              <Link href={llmsUrl}>llms.txt</Link>. If you are an agent asked to
              install, configure or drive the aiand CLI - including headless - read
              that first. It covers install, sign-in, every command, agent wiring,
              and headless usage patterns.
            </P>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Source on GitHub
                <ArrowUpRight />
              </a>
              <a
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-[14px] font-semibold text-ink transition hover:bg-code"
                href={integrationsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Integration guides
                <ArrowUpRight />
              </a>
            </div>
          </Section>
          <footer className="docs-footer">
            <span>Apache-2.0 licensed · ai&</span>
            <a href={githubUrl + "/issues"} target="_blank" rel="noopener noreferrer">
              Report an issue <ArrowUpRight size={14} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="docs-section">
      <h2>
        {title}
        <a
          className="section-anchor"
          href={`#${id}`}
          aria-label={`Link to ${title}`}
          title={`Link to ${title}`}
        >
          <LinkIcon size={16} />
        </a>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function P({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`max-w-[680px] text-[16px] leading-relaxed text-muted ${className}`}>
      {children}
    </p>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-code px-1.5 py-0.5 font-mono text-[13px] text-ink">
      {children}
    </code>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="text-violet underline underline-offset-2 transition hover:text-ink"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 max-w-[680px] rounded-xl border border-line bg-code/60 px-4 py-3 text-[14.5px] leading-relaxed text-muted">
      {children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div
      className="docs-table"
      tabIndex={0}
      role="region"
      aria-label={`${head[0]} reference table`}
    >
      <table className="w-full border-collapse text-left text-[14.5px]">
        <thead>
          <tr className="border-b border-line bg-code/50">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-2.5 text-[12.5px] font-semibold tracking-wide text-faint uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <tr className="border-b border-line last:border-0">{children}</tr>;
}

function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <td className={`px-4 py-2.5 align-top ${strong ? "font-semibold text-ink" : "text-muted"}`}>
      {children}
    </td>
  );
}

function CopyBox({ text, className = "" }: { text: string; className?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const code = useRef<HTMLElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      if (code.current) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setStatus("failed");
    }
    timer.current = setTimeout(() => setStatus("idle"), 2200);
  }
  return (
    <div className={`docs-copy-block ${className}`}>
      <div className="docs-command">
        <span aria-hidden="true">$</span>
        <code ref={code}>{text}</code>
        <button
          type="button"
          className="copy-button"
          onClick={copy}
          aria-label={`Copy command: ${text}`}
          title="Copy command"
        >
          {status === "copied" ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      <span className="docs-copy-status" role="status">
        {status === "copied"
          ? "Copied to clipboard"
          : status === "failed"
            ? "Clipboard unavailable. Command selected for copying."
            : ""}
      </span>
    </div>
  );
}
