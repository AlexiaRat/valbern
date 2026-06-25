import { defineConfig } from "vitest/config";

// Tests point the DynamoDB client at DynamoDB Local (npm run db:up) via DDB_ENDPOINT.
// CORE_TABLE is the throwaway table the suite creates/drops.
export default defineConfig({
  test: {
    env: {
      // Honor a shell-provided endpoint (e.g. when DDB Local runs on a Windows Docker engine
      // reachable via the WSL host IP); default to localhost for `npm run db:up`.
      DDB_ENDPOINT: process.env.DDB_ENDPOINT || "http://localhost:8000",
      AWS_REGION: "local",
      CORE_TABLE: "core-test",
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
