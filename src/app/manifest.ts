import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FamPlan",
    short_name: "FamPlan",
    description:
      "A family coordination layer for shared plans, reminders, and short-notice activities.",
    start_url: "/pod/pod-sunrise",
    display: "standalone",
    background_color: "#f6f0e6",
    theme_color: "#153a31",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
