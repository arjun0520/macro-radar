import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Macro Radar",
    short_name: "Radar",
    description: "High-signal macro and portfolio event radar.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5ee",
    theme_color: "#00c076",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
