export const siteUrl = "https://aiand-relay-6eb9031f.onbld.com";

export function pageHead(title: string, description: string, path: string) {
  const url = `${siteUrl}${path}`;
  const image = `${siteUrl}/image.png`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "ai&" },
      { property: "og:locale", content: "en_US" },
      { property: "og:image", content: image },
      {
        property: "og:image:alt",
        content: "ai& CLI: Less setup. More building.",
      },
      { property: "og:image:width", content: "1585" },
      { property: "og:image:height", content: "937" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      {
        name: "twitter:image:alt",
        content: "ai& CLI: Less setup. More building.",
      },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export function structuredData(data: Record<string, unknown>) {
  return { type: "application/ld+json", children: JSON.stringify(data).replace(/</g, "\\u003c") };
}
