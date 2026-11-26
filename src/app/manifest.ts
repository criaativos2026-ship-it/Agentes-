import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEXUS AI",
    short_name: "NEXUS AI",
    description: "Agentes de inteligência artificial sob medida para empresas.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/brand/nexus-icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/nexus-icone-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
