import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync: spawn }));

const originalArgv = process.argv;
let variables: Record<string, string>;
let failedRead: string | undefined;
let interruptedWrite: string | undefined;
let commands: string[][];

beforeEach(() => {
  vi.resetModules();
  commands = [];
  variables = {};
  failedRead = undefined;
  interruptedWrite = undefined;
  process.argv = ["node", "docker/setup.mjs"];
  vi.stubEnv("CONVEX_SELF_HOSTED_URL", "");
  vi.stubEnv("CONVEX_DEPLOY_KEY", "test-deployment");
  vi.stubEnv("SITE_URL", "http://kitchen.test");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("SMTP_FROM", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("setup aborted"); });
  spawn.mockImplementation((_executable: string, args: string[]) => {
    const command = args.slice(1);
    commands.push(command);
    if (command[0] === "env" && command[1] === "get") {
      if (command[2] === failedRead) return { status: 1, stderr: "Connection failed" };
      return { status: 0, stdout: variables[command[2]] ?? "" };
    }
    if (command[0] === "env" && command[1] === "set") {
      if (command[3] === interruptedWrite) return { status: 1 };
      variables[command[3]] = command[4];
    }
    return { status: 0 };
  });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const configure = () => import("../docker/setup.mjs");
const writes = () => commands.filter(command => command[0] === "env" && command[1] === "set");

describe("home server configuration preserves deployment keys", () => {
  test.each(["JWT_PRIVATE_KEY", "JWKS", "SECRETS_ENCRYPTION_KEY"])("aborts before any changes when %s cannot be read", async name => {
    variables = { JWT_PRIVATE_KEY: "private", JWKS: "public", SECRETS_ENCRYPTION_KEY: "encryption" };
    failedRead = name;
    await expect(configure()).rejects.toThrow("setup aborted");
    expect(writes()).toEqual([]);
    expect(commands.some(command => command[0] === "deploy")).toBe(false);
    expect(variables.SECRETS_ENCRYPTION_KEY).toBe("encryption");
  });

  test.each(["JWT_PRIVATE_KEY", "JWKS"])("rejects an incomplete pair containing only %s", async name => {
    variables[name] = "existing-key";
    await expect(configure()).rejects.toThrow("setup aborted");
    expect(writes()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Restore the matching JWT_PRIVATE_KEY and JWKS"));
  });

  test("fresh setup creates keys and a rerun preserves them", async () => {
    await configure();
    expect(variables.JWT_PRIVATE_KEY).toContain("BEGIN PRIVATE KEY");
    expect(JSON.parse(variables.JWKS).keys).toHaveLength(1);
    expect(variables.SECRETS_ENCRYPTION_KEY).toBeTruthy();
    const saved = { ...variables };
    commands = [];
    vi.resetModules();
    await configure();
    expect(variables).toEqual(saved);
    expect(writes()).toEqual([]);
    expect(commands).toContainEqual(["run", "units:seed"]);
  });

  test("a failed second signing-key write cannot silently succeed on rerun", async () => {
    interruptedWrite = "JWKS";
    await expect(configure()).rejects.toThrow("setup aborted");
    const privateKey = variables.JWT_PRIVATE_KEY;
    expect(privateKey).toBeTruthy();
    expect(variables.JWKS).toBeUndefined();
    interruptedWrite = undefined;
    commands = [];
    vi.resetModules();
    await expect(configure()).rejects.toThrow("setup aborted");
    expect(writes()).toEqual([]);
    expect(variables.JWT_PRIVATE_KEY).toBe(privateKey);
  });
});
