import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRA Care",
    short_name: "CRA Care",
    description: "Acompanhamento de tratamentos do Centro de Rinite e Alergia.",
    start_url: "/",
    display: "standalone",
    background_color: "#8f1033",
    theme_color: "#8f1033",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
