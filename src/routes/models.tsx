import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { pageHead, siteUrl, structuredData } from "../lib/seo";
import "../styles/landing.css";
import "../styles/docs.css";

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

const githubUrl = "https://github.com/aiandlabs/aiand-cli";
const docsUrl = "/docs";
const modelsUrl = "/models";
const consoleUrl = "https://console.aiand.com";
const docsSiteUrl = "https://docs.aiand.com";
const llmsUrl = "/llms.txt";

type Model = {
  /** Full model id, exactly as the catalog publishes it. */
  id: string;
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M cached-input tokens. */
  cached: number;
  /** USD per 1M output tokens, or null when the catalog does not publish one. */
  output: number | null;
  /** Context window, formatted for display. */
  context: string;
  /** Vendor mark in /public/logos, or null to fall back to a monogram. */
  logo: string | null;
  /** Monogram initials used when there is no vendor mark. */
  monogram: string;
};

const models: Model[] = [
  {
    id: "deepseek-ai/deepseek-v4-flash",
    input: 0.15,
    cached: 0.08,
    output: 0.25,
    context: "1.0M",
    logo: "/logos/deepseek.svg",
    monogram: "D",
  },
  {
    id: "openai/gpt-oss-120b",
    input: 0.15,
    cached: 0.05,
    output: null,
    context: "1.0M",
    logo: null,
    monogram: "O",
  },
  {
    id: "google/gemma-4-31b-it",
    input: 0.2,
    cached: 0.05,
    output: 0.5,
    context: "262.1K",
    logo: "/logos/google.svg",
    monogram: "G",
  },
  {
    id: "qwen/qwen3.6-27b",
    input: 0.32,
    cached: 0.2,
    output: 3.2,
    context: "262.1K",
    logo: "/logos/qwen.svg",
    monogram: "Q",
  },
  {
    id: "qwen/qwen3.8-27b",
    input: 0.4,
    cached: 0.2,
    output: 3.0,
    context: "262.1K",
    logo: "/logos/qwen.svg",
    monogram: "Q",
  },
  {
    id: "motif-technologies/motif-3",
    input: 0.5,
    cached: 0.2,
    output: 2.0,
    context: "262.1K",
    logo: null,
    monogram: "M",
  },
  {
    id: "moonshotai/kimi-k2.7-code",
    input: 0.75,
    cached: 0.2,
    output: 3.5,
    context: "262.1K",
    logo: "/logos/kimi.png",
    monogram: "M",
  },
  {
    id: "zai-org/glm-5.2",
    input: 1.0,
    cached: 0.3,
    output: 4.0,
    context: "1.0M",
    logo: null,
    monogram: "Z",
  },
  {
    id: "zai-org/glm-5.3",
    input: 1.0,
    cached: 0.3,
    output: 4.0,
    context: "1.0M",
    logo: null,
    monogram: "Z",
  },
  {
    id: "deepseek-ai/deepseek-v4-pro",
    input: 1.0,
    cached: 0.25,
    output: 2.5,
    context: "1.0M",
    logo: "/logos/deepseek.svg",
    monogram: "D",
  },
  {
    id: "moonshotai/kimi-k3",
    input: 3.0,
    cached: 0.5,
    output: 12.5,
    context: "1.0M",
    logo: "/logos/kimi.png",
    monogram: "M",
  },
];

const price = (value: number) => `$${value.toFixed(2)}`;

const modelDescription = (model: Model) =>
  [
    `Input ${price(model.input)}`,
    `Cached ${price(model.cached)}`,
    model.output === null ? "Output not published" : `Output ${price(model.output)}`,
    `per 1M tokens, context ${model.context}`,
  ].join(" / ");

export const Route = createFileRoute("/models")({
  head: () => ({
    ...pageHead(
      "Models | ai& CLI",
      "Open-weight models on ai& inference, with per-token pricing for input, cached input and output, and the context window of each model.",
      "/models",
    ),
    scripts: [
      structuredData({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "ai& model catalog",
        url: `${siteUrl}/models`,
        description:
          "Open-weight models available on ai& inference, with per-token pricing in USD per million tokens.",
        numberOfItems: models.length,
        itemListElement: models.map((model, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "CreativeWork",
            name: model.id,
            description: modelDescription(model),
            url: `${siteUrl}/models`,
          },
        })),
      }),
    ],
  }),
  component: Models,
});

function Models() {
  const { ref: tableRef, inView: tableInView } = useInView(0.05);

  return (
    <div className="relay-home">
      <div className="page-grid-lines" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="relay-nav-container">
        <header className="relay-nav wrap">
          <a className="relay-brand" href="/" aria-label="ai& Relay home">
            <img src="/aiand-logo.png" alt="ai& CLI" style={{ height: 32, width: 32 }} />
          </a>
          <nav aria-label="Main navigation">
            <a href="/#agents">Agents</a>
            <a href={docsUrl}>Docs</a>
            <a href={modelsUrl} aria-current="page">
              Models
            </a>
            <a href={docsSiteUrl} target="_blank" rel="noopener noreferrer">
              API docs
            </a>
            <a className="github-link" href={githubUrl} target="_blank" rel="noopener noreferrer">
              GitHub <ArrowUpRight size={14} />
            </a>
          </nav>
        </header>
      </div>
      <main id="main-content">
        <section className="wrap" aria-labelledby="models-heading">
          <div
            style={{
              paddingTop: "64px",
              paddingBottom: "48px",
              maxWidth: "760px",
            }}
          >
            <p className="eyebrow">AI&amp; CATALOG</p>
            <h1 id="models-heading">
              Open-weight models,
              <br />
              per-token pricing.
            </h1>
            <p
              style={{
                marginTop: "20px",
                fontSize: "16px",
                lineHeight: 1.7,
                color: "var(--relay-muted)",
              }}
            >
              Every open-weight model ai&amp; serves, with what it costs to read a
              token, read it again from cache, and write one back. Buy credits in the{" "}
              <Link href={consoleUrl}>console</Link>, or read the{" "}
              <Link href={`${docsSiteUrl}/models/pricing/`}>live catalog</Link> for the
              authoritative list. An LLM-readable version is published at{" "}
              <Code>llms.txt</Code>.
            </p>
          </div>
          <div
            ref={tableRef}
            style={
              tableInView
                ? { animation: "fade-up 600ms cubic-bezier(0.23,1,0.32,1) both" }
                : { opacity: 0, transform: "translateY(16px)" }
            }
          >
            <Table
              head={["Model", "Input", "Cached input", "Output", "Context"]}
              label="Model catalog with per-token pricing"
            >
              {models.map((model) => (
                <Row key={model.id}>
                  <Cell strong>
                    <span className="flex items-center gap-2.5">
                      <ModelMark model={model} />
                      <span className="font-mono text-[13.5px]">{model.id}</span>
                    </span>
                  </Cell>
                  <Cell>{price(model.input)}</Cell>
                  <Cell>{price(model.cached)}</Cell>
                  <Cell>
                    {model.output === null ? (
                      <span className="text-faint" title="Output price is not published for this model.">
                        &mdash;
                      </span>
                    ) : (
                      price(model.output)
                    )}
                  </Cell>
                  <Cell>{model.context}</Cell>
                </Row>
              ))}
            </Table>
          </div>
          <div style={{ padding: "18px 0 72px" }}>
            <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.7, color: "var(--relay-muted)" }}>
              Prices in USD per million tokens.
            </p>
            <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.7, color: "var(--relay-muted)" }}>
              The catalog is live &mdash; <Code>aiand models</Code> shows current
              prices in your billing currency.
            </p>
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
            <a href={modelsUrl}>Models</a>
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

function ModelMark({ model }: { model: Model }) {
  if (model.logo) {
    return (
      <img
        src={model.logo}
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        style={{ width: 24, height: 24, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        borderRadius: 6,
        background: "#f0f0ee",
        width: 24,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 600,
        color: "#151517",
        fontFamily: "var(--font-mono)",
        flexShrink: 0,
      }}
    >
      {model.monogram}
    </span>
  );
}

function Table({
  head,
  label,
  children,
}: {
  head: string[];
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="docs-table" tabIndex={0} role="region" aria-label={label}>
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
    <td
      className={`px-4 py-2.5 align-top ${strong ? "font-semibold text-ink" : "text-muted"}`}
    >
      {children}
    </td>
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
      className="text-aiand underline underline-offset-2 transition hover:text-ink"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}