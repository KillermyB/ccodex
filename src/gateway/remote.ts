import { type ChildProcess, spawn } from "node:child_process";
import { remoteRelayBinary, remoteRelayEnvironment } from "../security/relay.js";
import { saveDaemonSettings } from "../daemon/settings.js";
import type { Logger } from "../log.js";
import { RpcFailure, invalidRequest, type JsonObject } from "../protocol/codex.js";
import type { Connection } from "./connection.js";

const START_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_LINE_BYTES = 1_000_000;

export const relayBinary = remoteRelayBinary;

interface Relay {
  readonly child: ChildProcess;
  request(method: string, params: unknown, clientName?: string): Promise<unknown>;
  stop(): Promise<void>;
}

/**
 * Remote control (mobile) through the Rust relay: the relay enrolls with chatgpt.com and bridges each mobile
 * client to the gateway socket. Stock's own remote control stays disabled; its status notifications are replaced
 * by the relay's.
 */
export class RemoteControl {
  private relay?: Relay;
  private status?: JsonObject;
  private readonly watchers = new Set<Connection>();
  private operations = Promise.resolve();

  public constructor(
    private readonly socketPath: string,
    private readonly logger: Logger,
    private readonly initiallyEnabled: boolean,
  ) {}

  public start(): Promise<void> {
    return this.initiallyEnabled ? this.serial(() => this.startRelay()).catch(() => {
      this.logger.warn("remote-relay.start.failed");
      this.update({ status: "disabled", environmentId: null });
    }) : Promise.resolve();
  }

  public stop(): Promise<void> {
    return this.serial(() => this.stopRelay());
  }

  public enable(ephemeral: boolean): Promise<JsonObject> {
    return this.serial(async () => {
      await this.startRelay();
      if (!ephemeral) saveDaemonSettings({ remoteControlEnabled: true });
      if (!this.status) throw new Error("Remote-control identity is not available yet.");
      return this.status;
    });
  }

  public disable(ephemeral: boolean): Promise<JsonObject> {
    return this.serial(async () => {
      await this.stopRelay();
      if (!ephemeral) saveDaemonSettings({ remoteControlEnabled: false });
      this.update({ ...this.status, status: "disabled", environmentId: null });
      return this.status!;
    });
  }

  public current(): JsonObject | undefined {
    return this.status;
  }

  public pairing(method: string, params: unknown, clientName?: string): Promise<unknown> {
    if (!["remoteControl/pairing/start", "remoteControl/pairing/status"].includes(method)) return Promise.reject(invalidRequest("unsupported remote pairing method"));
    if (!this.relay) return Promise.reject(invalidRequest("remote control pairing requires remote control to be enabled"));
    return this.relay.request(method, params, clientName);
  }

  /** Stock's (disabled) status for a client: the client gets the relay's status now and on every change. */
  public intercept(connection: Connection, stockStatus: JsonObject): void {
    this.watchers.add(connection);
    this.status ??= stockStatus;
    connection.notify("remoteControl/status/changed", this.status);
  }

  public detach(connection: Connection): void {
    this.watchers.delete(connection);
  }

  private update(status: JsonObject): void {
    this.status = status;
    for (const connection of this.watchers) connection.notify("remoteControl/status/changed", status);
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  private async stopRelay(): Promise<void> {
    const relay = this.relay;
    this.relay = undefined;
    await relay?.stop();
  }

  private async startRelay(): Promise<void> {
    if (this.relay) return;
    const env = remoteRelayEnvironment();
    const child = spawn(relayBinary(), ["--socket", this.socketPath], { env, stdio: ["pipe", "pipe", "pipe"] });
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
    const failPending = (error: Error) => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
      pending.clear();
    };
    let stopping = false;
    let nextId = 0;
    let buffer = "";
    let markReady!: () => void;
    let failStart!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { markReady = resolve; failStart = reject; });
    const timeout = setTimeout(() => failStart(new Error("Timed out starting remote-control relay.")), START_TIMEOUT_MS);
    child.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) { failStart(new Error("Remote relay output exceeded its limit.")); child.kill("SIGKILL"); return; }
      for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const event = JSON.parse(line) as JsonObject;
          if (event.type === "status") this.update(event.params);
          else if (event.type === "ready") markReady();
          else if (event.type === "response") {
            const request = pending.get(event.id);
            pending.delete(event.id);
            if (request) clearTimeout(request.timer);
            if (event.error) request?.reject(new RpcFailure(event.error.code, event.error.message));
            else request?.resolve(event.result);
          }
        } catch (error) {
          this.logger.warn("remote-relay.stdout.invalid");
        }
      }
    });
    // Keep account details, URLs and pairing material out of gateway logs.
    child.stderr!.resume();
    child.stdin!.on("error", () => failPending(new Error("Remote relay input closed.")));
    child.once("error", (error) => { failStart(error); failPending(error); });
    child.once("exit", (code, signal) => {
      failPending(new Error("Remote-control relay exited."));
      if (stopping) return;
      failStart(new Error(`Remote-control relay exited unexpectedly (${signal ?? code ?? "unknown"}).`));
      this.logger.error("remote-relay.exited", { code, signal });
      this.relay = undefined;
      this.update({ status: "disabled", environmentId: null });
    });
    try {
      await ready;
    } catch (error) {
      stopping = true;
      child.kill("SIGKILL");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    this.logger.info("remote-relay.started", { pid: child.pid, socketPath: this.socketPath });
    this.relay = {
      child,
      request: (method, params, clientName) => new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("Remote pairing request timed out.")); }, REQUEST_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        child.stdin!.write(`${JSON.stringify({ id, method, params, clientName })}\n`, (error) => {
          if (!error) return; clearTimeout(timer); pending.delete(id); reject(error);
        });
      }),
      stop: async () => {
        stopping = true;
        failPending(new Error("Remote-control relay stopped."));
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill("SIGINT");
        const force = setTimeout(() => child.kill("SIGKILL"), 3_000);
        await new Promise<void>((resolve) => child.once("exit", () => resolve()));
        clearTimeout(force);
      },
    };
  }
}
