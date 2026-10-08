/** @type {import('next').NextConfig} */
import { fileURLToPath } from "node:url";
const config = {
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: fileURLToPath(new URL("../", import.meta.url)),
};
export default config;
