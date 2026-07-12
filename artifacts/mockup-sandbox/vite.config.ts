import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

function normalizeBasePath(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("BASE_PATH environment variable cannot be empty.");
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function resolvePort() {
  const rawPort = process.env.PORT ?? "8081";
  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return port;
}

export default defineConfig(() => {
  const port = resolvePort();
  const basePath = normalizeBasePath(process.env.BASE_PATH ?? "/");

  return {
    base: basePath,
    plugins: [
      mockupPreviewPlugin(),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
