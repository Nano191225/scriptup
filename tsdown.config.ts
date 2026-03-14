import { defineConfig } from "tsdown";

export default defineConfig({
    entry: "src/index.ts",
    target: "es2024",
    outExtensions: () => ({ js: ".js" }),
    minify: true,
});