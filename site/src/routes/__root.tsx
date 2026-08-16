/// <reference types="vite/client" />
import type { ReactNode } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import appCss from "../styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "ai& Relay - Run Claude Code, Codex, OpenCode & Pi Code on ai&",
      },
      {
        name: "description",
        content:
          "A local relay that points Claude Code, Codex, OpenCode, and Pi Code at open models on ai& - short commands, zero edits to your real tool config.",
      },
      { property: "og:title", content: "ai& Relay" },
      {
        property: "og:description",
        content:
          "Run your coding agents on ai& open models. One install, four harnesses, config-free.",
      },
      { property: "og:image", content: "/aiand-logo.png" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "ai& Relay" },
      { name: "twitter:image", content: "/aiand-logo.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/aiand-logo.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/aiand-logo.png" },
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
