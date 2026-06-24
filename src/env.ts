// Strict env access. Fail loud at cold start if a required variable is missing rather than
// surfacing `undefined` deep inside a handler.

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(`missing required env var: ${name}`);
  }
  return v;
}
