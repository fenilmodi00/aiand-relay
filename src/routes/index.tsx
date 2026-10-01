import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { StreamingText } from "../components/StreamingText";
import { CofounderGraphic } from "../components/CofounderGraphic";
import {
  ArrowRight,
  ArrowUpRight,
  Cable,
  ChartNoAxesCombined,
  Check,
  Copy,
  FileText,
  Search,
  ShieldCheck,
  Terminal,
  ChevronRight,
} from "lucide-react";
import "../styles/landing.css";
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
import { ThinkingState, useSequence } from "../components/ThinkingState";
import {
  SpinnerRing,
  Badge,
  CheckIcon,
  TaskRows,
  type TaskRow,
} from "../components/TaskRows";
import ToolChips from "../components/ToolChips";
import { pageHead, siteUrl, structuredData } from "../lib/seo";
import { useEffect, useRef, useState } from "react";

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

const installCommand = "npm install -g @aiand/cli";
const githubUrl = "https://github.com/aiandlabs/aiand-cli";
const docsUrl = "/docs";
const consoleUrl = "https://console.aiand.com";
const docsSiteUrl = "https://docs.aiand.com";
const llmsUrl = "/llms.txt";

type Agent = {
  name: string;
  command: string;
  status: string;
  mark: ReactNode;
  blurb: string;
};

const agents: Agent[] = [
  {
    name: "OpenCode",
    command: "aiand opencode on",
    status: "Supported",
    mark: <OpenCodeMark />,
    blurb:
      "Adds an ai& provider to your OpenCode config. Your other providers and edits stay untouched. Plain opencode uses ai& afterwards.",
  },
  {
    name: "Claude Code",
    command: "aiand claude on",
    status: "Supported",
    mark: <ClaudeMark />,
    blurb:
      "Writes the gateway URL and a catalog model into your Claude settings. Vision slot, fast background slot, and model picker handled for you.",
  },
  {
    name: "Codex CLI",
    command: "aiand codex on",
    status: "Supported",
    mark: <CodexMark />,
    blurb:
      "Writes a separate ai& profile and leaves config.toml alone. Run codex --profile aiand to use ai&. Your key never lives in the file.",
  },
  {
    name: "Pi Code",
    command: "aiand pi on",
    status: "Upcoming",
    mark: <PiMark />,
    blurb: "Upcoming. Pi agent wiring through ai& — same on / off / status pattern as the rest.",
  },
  {
    name: "Prime Agent",
    command: "aiand prime on",
    status: "Upcoming",
    mark: <PrimeMark />,
    blurb: "Upcoming. PrimeIntellect's agent on ai& models, with your own Prime config left alone.",
  },
  {
    name: "Hermes Agent",
    command: "aiand hermes on",
    status: "Upcoming",
    mark: <HermesMark />,
    blurb: "Upcoming. Nous Research's Hermes agent on ai& with an isolated home overlay.",
  },
  {
    name: "DeepSeek",
    command: "aiand deepseek on",
    status: "Upcoming",
    mark: <DeepSeekMark />,
    blurb: "Upcoming. DeepSeek harness on ai& models.",
  },
  {
    name: "Grok Build",
    command: "aiand grok on",
    status: "Upcoming",
    mark: <GrokMark />,
    blurb: "Upcoming. Grok Build UI driving ai& models, key kept away from api.x.ai.",
  },
  {
    name: "Unreal Agent",
    command: "aiand unreal on",
    status: "Upcoming",
    mark: <UnrealMark />,
    blurb: "Upcoming. Unreal Labs' async-first runner on ai&.",
  },
  {
    name: "omp",
    command: "aiand omp on",
    status: "Upcoming",
    mark: <OmpMark />,
    blurb: "Upcoming. Oh My Pi (omp) on ai& models.",
  },
];

const steps = [
  {
    title: "Install once",
    body: (
      <>
        Install with npm (Node.js 22+) or the shell installer. Then update by running the install
        command again.
      </>
    ),
    graphic: <Step1Graphic />,
  },
  {
    title: "Sign in",
    body: (
      <>
        Run <code>aiand login</code>. Approve in your browser — no API keys to copy. Keys last 30
        days and rotate automatically.
      </>
    ),
    graphic: <Step2Graphic />,
  },
  {
    title: "Wire an agent",
    body: (
      <>
        Run <code>aiand opencode on</code>, <code>aiand claude on</code>, or{" "}
        <code>aiand codex on</code>. Use <code>off</code> to remove exactly what aiand added.
      </>
    ),
    graphic: <Step3Graphic />,
  },
];

const features = [
  {
    title: "Browser sign-in, no key copying",
    body: "aiand login opens your browser. Device-code fallback covers SSH and headless machines. CI uses AIAND_API_KEY with nothing stored.",
  },
  {
    title: "Your settings stay yours",
    body: "on snapshots your files first. off removes only what aiand wrote. restore --force puts back the exact bytes from before.",
  },
  {
    title: "See models and prices",
    body: "aiand models shows the live catalog with prices in your billing currency. aiand logs and aiand usage cover your whole organization.",
  },
  {
    title: "One status check, every agent",
    body: "aiand status shows which agents are wired and which are still coming. aiand init detects everything at once, or wire one agent at a time.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    ...pageHead(
      "ai& CLI | Less setup. More building.",
      "Connect OpenCode, Claude Code and Codex to ai& inference. Sign in through your browser, keep your settings, see models and prices.",
      "/",
    ),
    scripts: [
      structuredData({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "ai& CLI",
        url: `${siteUrl}/`,
        description: "Connect the tools you love to ai& inference.",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "macOS, Linux, Windows",
        license: "https://github.com/aiandlabs/aiand-cli/blob/main/LICENSE",
        downloadUrl: "https://www.npmjs.com/package/@aiand/cli",
        sameAs: githubUrl,
      }),
    ],
  }),
  component: Home,
});

function Home() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "select">("idle");
  const commandRef = useRef<HTMLElement>(null);
  const { ref: featuresRef, inView: featuresInView } = useInView(0.1);

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

  return (
    <div className="relay-home">
      <div className="page-grid-lines" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="relay-nav-container">
        <header className="relay-nav wrap">
          <a className="relay-brand" href="/" aria-label="ai& CLI home">
            <img src="/aiand-logo.png" alt="ai& CLI" style={{ height: 32, width: 32 }} />
          </a>
          <nav aria-label="Main navigation">
            <a href="#agents">Agents</a>
            <a href={docsUrl}>Docs</a>
            <a href={docsSiteUrl} target="_blank" rel="noopener noreferrer">
              API docs
            </a>
            <a className="github-link" href={githubUrl} target="_blank" rel="noopener noreferrer">
              <svg
                height="16"
                width="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
                fill="currentColor"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
            <a className="button button-dark" href="#install">
              Get started <ArrowRight size={16} />
            </a>
          </nav>
        </header>
      </div>
      <main id="main-content">
        <section className="relay-hero" aria-labelledby="hero-heading">
          <div className="wrap relay-hero-split">
            <div className="hero-split-left">
              <div className="hero-eyebrow-container">
                <div className="hero-eyebrow-logos">
                  <div className="eyebrow-logo">
                    <img src="/aiand-logo.png" alt="" width="22" height="22" />
                  </div>
                </div>
                <p className="eyebrow">LESS SETUP. MORE BUILDING.</p>
              </div>
              <h1 id="hero-heading">
                Connect the tools you love
                <br />
                to ai&amp; inference.
              </h1>
              <div
                className="hero-actions-container"
                style={{ display: "flex", gap: "16px", alignItems: "center", marginTop: "24px" }}
              >
                <a className="button button-dark" href="#install">
                  Get started <ArrowUpRight size={16} />
                </a>
                <a className="button button-light" href={docsUrl}>
                  <FileText size={16} /> Read the docs
                </a>
              </div>
            </div>
            <div className="hero-split-right">
              <p className="hero-description">
                ai&amp; CLI handles sign-in and configuration, so you can get straight to building.
                Sign in through your browser, keep your settings, see models and prices.
              </p>
              <div className="hero-meta">
                <span>
                  <img
                    src="/logos/opensource.png"
                    alt=""
                    style={{ width: 14, height: 14, objectFit: "contain" }}
                  />{" "}
                  Open source
                </span>
                <span>
                  <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <img
                      src="/logos/mac.png"
                      alt=""
                      style={{ width: 14, height: 14, objectFit: "contain" }}
                    />
                    <img
                      src="/logos/linux.png"
                      alt=""
                      style={{ width: 14, height: 14, objectFit: "contain" }}
                    />
                  </span>
                  macOS &amp; Linux
                </span>
                <span>
                  <img
                    src="/logos/windows.png"
                    alt=""
                    style={{ width: 14, height: 14, objectFit: "contain" }}
                  />{" "}
                  Windows
                </span>
                <span>
                  <img
                    src="/logos/config.png"
                    alt=""
                    style={{ width: 14, height: 14, objectFit: "contain" }}
                  />{" "}
                  Config-free
                </span>
              </div>
            </div>
          </div>
          <div className="relay-hero-banner">
            <div
              style={{
                position: "relative",
                borderRadius: 0,
                overflow: "hidden",
                background:
                  "linear-gradient(135deg, #151517 0%, #303037 55%, #E2091A 130%)",
                minHeight: 400,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "64px 24px",
              }}
            >
              <div className="install-terminal hero-install" id="install" style={{ position: "relative", top: "auto", left: "auto", transform: "none" }}>
                <div className="terminal-inner">
                  <div className="terminal-bar">
                    <span>
                      <Terminal size={15} /> Terminal
                    </span>
                    <span>npm · Node.js 22+</span>
                  </div>
                  <div className="install-command">
                    <span aria-hidden="true">$</span>
                    <code ref={commandRef}>{installCommand}</code>
                    <button
                      type="button"
                      className="copy-button"
                      onClick={handleCopy}
                      title="Copy install command"
                      aria-label="Copy install command"
                    >
                      {copyState === "copied" ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                  <div className="terminal-foot">
                    <span>aiand login · aiand opencode on</span>
                    <span role="status">
                      {copyState === "copied"
                        ? "Copied to clipboard"
                        : copyState === "select"
                          ? "Clipboard unavailable; command selected"
                          : "Then sign in through your browser"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="provider-strip wrap">
          <ProviderBrand />
          <span className="provider-divider" />
          <a
            className="provider-brand"
            href={consoleUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              <small>Keys and billing in</small>
              <strong>console.aiand.com</strong>
            </span>
          </a>
        </div>
        <section className="agent-strip wrap" aria-label="Supported and upcoming agents">
          <span className="eyebrow">
            SAME TOOLS.
            <br />
            AI&amp; INFERENCE.
          </span>
          <div className="agent-strip-divider" />
          <div className="agent-marquee">
            <div className="agent-marquee-track">
              {[...Array(4)].map((_, i) => (
                <div className="agent-marquee-group" key={i} aria-hidden={i > 0}>
                  {agents.map((agent) => (
                    <div className="agent-marquee-logo" key={`${i}-${agent.name}`}>
                      {agent.mark}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="install-section wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / GET CONNECTED</p>
              <h2>
                Install. Sign in.
                <br />
                Wire an agent.
              </h2>
            </div>
            <p>
              From zero to your first agent run in three steps.
              <br />
              No endpoint URLs to memorize.
            </p>
          </div>
          <ol className="setup-steps">
            {steps.map((step, i) => (
              <li key={step.title}>
                <span className="step-number">0{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                {step.graphic}
              </li>
            ))}
          </ol>
        </section>
        <section className="agents-section" id="agents">
          <div className="wrap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">02 / PICK YOUR AGENT</p>
                <h2>
                  Three agents today.
                  <br />
                  More coming.
                </h2>
              </div>
              <p>
                Detect everything at once with <code>aiand init</code>.
                <br />
                Or wire one agent at a time.
              </p>
            </div>
            <div className="agents-grid">
              {agents.map((agent) => (
                <article className="agent-item" key={agent.name}>
                  <div className="agent-top">
                    <span className="agent-mark">{agent.mark}</span>
                    <span
                      className={
                        agent.status === "Supported" ? "agent-status supported" : "agent-status"
                      }
                    >
                      {agent.status}
                    </span>
                  </div>
                  <h3>{agent.name}</h3>
                  <p>{agent.blurb}</p>
                  <code>
                    <span aria-hidden="true">$ </span>
                    {agent.command}
                  </code>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="models-section wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">03 / MODELS &amp; PROMPTS</p>
              <h2>
                One prompt.
                <br />
                Or a whole session.
              </h2>
            </div>
            <div>
              <p>
                Stream a single prompt to stdout, or chat interactively.
                <br />
                Catalog prices shown in your billing currency.
              </p>
              <a
                className="text-link"
                href={`${docsSiteUrl}/models/catalog/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Model catalog <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
          <div className="model-list">
            <a href="/docs#running-prompts">
              <span className="model-index">01</span>
              <span className="model-logo">⌁</span>
              <h3>aiand run</h3>
              <span>git diff | aiand run “Review this diff”</span>
              <ArrowUpRight size={18} />
            </a>
            <a href="/docs#running-prompts">
              <span className="model-index">02</span>
              <span className="model-logo">◐</span>
              <h3>aiand chat</h3>
              <span>Interactive conversation</span>
              <ArrowUpRight size={18} />
            </a>
            <a href="/docs#logs">
              <span className="model-index">03</span>
              <span className="model-logo">◑</span>
              <h3>aiand models / logs / usage</h3>
              <span>Catalog, request logs, token usage</span>
              <ArrowUpRight size={18} />
            </a>
          </div>
        </section>
        <section className="features-section">
          <div className="wrap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">04 / FEATURES</p>
                <h2>
                  Built to stay
                  <br />
                  out of your way.
                </h2>
              </div>
              <p>
                Sign-in, wiring, and config
                <br />
                handled for you.
              </p>
            </div>
            <div className="feature-grid" ref={featuresRef}>
              {features.map((feature, i) => {
                const Icon = [Cable, Search, ChartNoAxesCombined, ShieldCheck][i];
                // Card 3 is the wide one: text left, animated graphic right.
                const horizontal = i === 3;
                return (
                  <article
                    key={feature.title}
                    className={
                      horizontal
                        ? "feature-card feature-card-3 feature-card-horizontal"
                        : `feature-card feature-card-${i}`
                    }
                    style={
                      featuresInView
                        ? {
                            animation: `fade-up 600ms cubic-bezier(0.23,1,0.32,1) ${i * 120}ms both`,
                          }
                        : { opacity: 0, transform: "translateY(16px)" }
                    }
                  >
                    <FeatureCardText feature={feature} icon={Icon} horizontal={horizontal} />
                    <div className="feature-graphic-container">
                      {i === 0 && <FeatureGraphic0 />}
                      {i === 1 && <FeatureGraphic1 />}
                      {i === 2 && <FeatureGraphic2 />}
                      {i === 3 && <FeatureGraphic3 />}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
        <section className="closing-section wrap">
          <div className="closing-inner">
            <div className="closing-left">
              <p className="eyebrow">LESS SETUP. MORE BUILDING.</p>
              <h2>
                Your next session,
                <br />
                powered by ai&amp;.
              </h2>
              <p className="closing-sub">Sign in through your browser. Keep your settings.</p>
            </div>
            <div className="closing-right">
              <a href="#install" className="button button-dark closing-cta">
                Get started <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer className="relay-footer wrap">
        <div className="footer-big-logo">
          <a href="/" aria-label="ai& CLI home" className="logo-mask">
            <span className="sr-only">ai&amp; CLI</span>
          </a>
        </div>
        <div className="footer-bottom">
          <span>ai&amp; CLI · docs for the aiand CLI</span>
          <nav aria-label="Footer navigation">
            <a href={docsUrl}>Docs</a>
            <a href={docsSiteUrl} target="_blank" rel="noopener noreferrer">
              API docs
            </a>
            <a href={githubUrl} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href={llmsUrl}>llms.txt</a>
          </nav>
        </div>
      </footer>
    </div>
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

function Step1Graphic() {
  const stage = useSequence([1500, 1500, 2000]);

  return (
    <div className="step-graphic">
      <div className="step-icon-wrapper w-full flex items-center justify-center pointer-events-none animate-step1">
        <div className="relative w-[88%] max-w-[360px]">
          <div className="rounded-lg border shadow-lg bg-black border-[#262626] text-left overflow-hidden h-[240px] flex flex-col relative">
            <div className="p-4 font-mono text-[11px] leading-relaxed text-gray-300">
              <div className="flex items-center gap-2">
                <span className="text-green-400">~</span>
                <span className="text-gray-500">$</span>
                <span className="text-white">npm install -g @aiand/cli</span>
              </div>

              {stage >= 1 && (
                <div
                  className="mt-2 flex flex-col gap-1.5 opacity-90"
                  style={{ animation: "fade-in 300ms ease-out both" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="scale-75 origin-left flex items-center justify-center w-5 h-5">
                      {stage === 1 ? (
                        <SpinnerRing active />
                      ) : (
                        <Badge tone="green">{CheckIcon}</Badge>
                      )}
                    </span>
                    <span>Installing @aiand/cli...</span>
                  </div>
                  {stage >= 2 && (
                    <div
                      className="flex items-center gap-2"
                      style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}
                    >
                      <span className="scale-75 origin-left flex items-center justify-center w-5 h-5">
                        {stage === 2 ? (
                          <SpinnerRing active />
                        ) : (
                          <Badge tone="green">{CheckIcon}</Badge>
                        )}
                      </span>
                      <span>Requires Node.js 22+</span>
                    </div>
                  )}
                  {stage >= 3 && (
                    <div
                      className="mt-1 flex items-center gap-2 text-green-400 font-medium"
                      style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}
                    >
                      <span className="px-2 py-0.5 rounded-full bg-green-500/20">✓ Success</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black to-transparent pointer-events-none"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step2Graphic() {
  const stage = useSequence([1500, 1500, 1500, 2000]);

  return (
    <div className="step-graphic">
      <div className="step-icon-wrapper w-full flex items-center justify-center pointer-events-none animate-step2">
        <div className="relative w-[88%] max-w-[360px]">
          <div className="rounded-xl border shadow-2xl bg-[#0a0a0a] border-white/10 text-left overflow-hidden h-[240px] flex flex-col relative">
            <div className="p-4 font-mono text-[11px] leading-relaxed text-gray-300">
              <div className="mb-2 text-gray-400 flex items-center gap-2">
                <span className="text-green-400">~</span>
                <span className="text-gray-500">$</span>
                <span className="text-white">aiand login</span>
              </div>

              {stage >= 1 && (
                <div
                  className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1"
                  style={{ animation: "fade-up 300ms ease-out both" }}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight size={14} strokeWidth={3} className="text-blue-400" />
                    <span className="text-white font-medium">Opening browser…</span>
                  </div>
                  {stage >= 2 && (
                    <div
                      className="text-gray-500 tracking-[0.2em] flex items-center"
                      style={{ animation: "fade-in 200ms ease-out both" }}
                    >
                      Approve at api.aiand.com
                    </div>
                  )}
                </div>
              )}
              {stage >= 3 && (
                <div
                  className="mt-3 flex items-center flex-wrap gap-x-2 gap-y-1 opacity-90"
                  style={{ animation: "fade-up 300ms ease-out both" }}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight size={14} strokeWidth={3} className="text-blue-400" />
                    <span className="text-white font-medium">Key stored, rotates automatically</span>
                  </div>
                  {stage >= 4 && (
                    <div
                      className="text-gray-500 tracking-[0.2em] flex items-center"
                      style={{ animation: "fade-in 200ms ease-out both" }}
                    >
                      aiand@hostname
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black to-transparent pointer-events-none"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step3Graphic() {
  return (
    <div className="step-graphic">
      <div className="step-icon-wrapper w-full flex items-center justify-center animate-step3">
        <div className="relative w-[90%] max-w-[380px] pointer-events-auto">
          <div className="rounded-xl border shadow-2xl bg-[#0a0a0a] border-white/10 text-left overflow-hidden flex flex-col h-[240px] relative">
            <div className="flex-1 p-3 font-mono text-[10px] leading-relaxed text-gray-300 overflow-hidden relative">
              <div className="mb-2 text-gray-400">~/project</div>
              <div className="mb-3 text-[#e5e5e5] border border-[#333] bg-[#1a1a1a] px-2 py-1.5 rounded shadow-sm">
                $ aiand opencode on
              </div>

              <div className="mt-2" style={{ marginLeft: "-4px" }}>
                <ThinkingState variant="Coding" theme="dark" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black to-transparent pointer-events-none"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Feature = {
  title: string;
  body: string;
};

/* Shared icon + copy block for every feature card. The wide card adds
   the `feature-card-text-left` modifier that the horizontal CSS reads. */
function FeatureCardText({
  feature,
  icon: Icon,
  horizontal,
}: {
  feature: Feature;
  icon: typeof Cable;
  horizontal?: boolean;
}) {
  return (
    <div className={horizontal ? "feature-card-text feature-card-text-left" : "feature-card-text"}>
      <div className="feature-icon-wrapper">
        <Icon size={20} strokeWidth={2} />
      </div>
      <h3>{feature.title}</h3>
      <p>{feature.body}</p>
    </div>
  );
}

function FeatureGraphic0() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-[115%] max-w-[420px] opacity-90 flex justify-center">
        <CofounderGraphic />
      </div>
    </div>
  );
}

function FeatureGraphic1() {
  return (
    <div className="absolute inset-0 flex items-start justify-center p-6 pb-0 pt-6">
      <div className="w-[95%] flex justify-center">
        <StreamingText fill loop />
      </div>
    </div>
  );
}

const COST_ROWS = [
  {
    icon: "think",
    label: "Check wiring",
    chip: "aiand status",
    mono: true,
    detailMono: false,
    detail: [{ text: "Signed in as you" }, { text: "opencode, claude, codex: on" }],
  },
  {
    icon: "read",
    label: "List models",
    chip: "aiand models",
    mono: true,
    detailMono: true,
    detail: [{ text: "Prices in your currency" }, { text: "Live catalog" }],
  },
  {
    icon: "run",
    label: "Tail requests",
    chip: "aiand logs --follow",
    mono: true,
    detailMono: true,
    detail: [
      { text: "Org-wide requests" },
      { text: "Errors with --errors", tone: "add" as const },
    ],
  },
  {
    icon: "write",
    label: "Compare usage",
    chip: "aiand usage",
    mono: true,
    detailMono: true,
    detail: [{ text: "vs previous period", tone: "add" as const }],
  },
];

/* `aiand status` reports the files it wrote when wiring agents — so the
   diff chips are the config ai& touched, not source edits. */
const COST_DIFFS = [
  { file: "opencode.json", add: 4, del: 0 },
  { file: "settings.json", add: 8, del: 1 },
];

function FeatureGraphic2() {
  return (
    <div className="absolute inset-0 flex items-start justify-start p-5 pt-6">
      <ToolChips
        steps={COST_ROWS}
        diffs={COST_DIFFS}
        className="w-full"
        labels={{ header: "aiand status · models · logs", more: "" }}
      />
    </div>
  );
}

const UPDATE_ROWS: TaskRow[] = [
  {
    key: "status",
    label: "Check agents",
    amount: "3 wired",
    status: "done",
    details: [
      { label: "opencode", meta: "on" },
      { label: "claude", meta: "on" },
      { label: "codex", meta: "on" },
    ],
  },
  {
    key: "upcoming",
    label: "Next agents",
    amount: "7 planned",
    status: "sequence",
    step: 2,
    details: [
      { label: "pi, prime, hermes", meta: "Planned" },
      { label: "deepseek, grok, unreal, omp", meta: "Planned" },
    ],
  },
];

function FeatureGraphic3() {
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ padding: "20px 24px" }}>
      <TaskRows rows={UPDATE_ROWS} className="w-full" />
    </div>
  );
}
