import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KaziKenya — Fundis & Freelancers",
    short_name: "KaziKenya",
    description: "Hire trusted fundis and freelancers in all 47 counties. Pay safely with M-Pesa escrow.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f7f3",
    theme_color: "#0e5c39",
    lang: "en-KE",
    dir: "ltr",
    categories: ["business", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Post a job", short_name: "Post job", url: "/jobs/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Find a pro", short_name: "Explore", url: "/explore", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My work", short_name: "My work", url: "/work", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
