/// <reference types="vite/client" />
import type { ReactNode } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import appCss from "../styles/app.css?url";

// Absolute URLs required for Discord, WhatsApp, Slack, Telegram, iMessage, LinkedIn.
const SITE_URL = "https://aiand-relay.vercel.app";
const OG_IMAGE = `${SITE_URL}/og-banner.png`;
const PAGE_TITLE = "ai& Relay - Run Claude Code, Codex, OpenCode & Pi Code on ai&";
const PAGE_DESCRIPTION =
  "A local relay that points Claude Code, Codex, OpenCode, and Pi Code at open models on ai& - short commands, zero edits to your real tool config.";
const OG_DESCRIPTION =
  "Run your coding agents on ai& open models. One install, multiple harnesses, config-free.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { name: "theme-color", content: "#0a0a0a" },
      // Open Graph (Discord, WhatsApp, Facebook, LinkedIn, Slack, Telegram, iMessage)
      { property: "og:site_name", content: "ai& Relay" },
      { property: "og:locale", content: "en_US" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: OG_DESCRIPTION },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:secure_url", content: OG_IMAGE },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "ai& Relay — run coding agents on open models" },
      // Twitter / X (also used as fallback by some crawlers)
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: OG_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: "ai& Relay — run coding agents on open models" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: SITE_URL },
      { rel: "icon", href: "/aiand-logo.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "llms-txt", href: "/llms.txt" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
