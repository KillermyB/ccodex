import type { Logger } from "../log.js";
import type { JsonObject } from "../protocol/codex.js";
import type { Connection } from "./connection.js";
export function relayBinary(): string { throw new Error("CCodex Secure contains no native relay."); }
export class RemoteControl {
  constructor(_socket: string, _logger: Logger, _enabled: boolean) {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async enable(_ephemeral: boolean): Promise<JsonObject> { throw new Error("Remote control is disabled in CCodex Secure."); }
  async disable(_ephemeral: boolean): Promise<JsonObject> { return { status: "disabled", environmentId: null }; }
  current(): JsonObject | undefined { return undefined; }
  async pairing(_method: string, _params: unknown, _clientName?: string): Promise<unknown> { throw new Error("Remote pairing is disabled."); }
  intercept(connection: Connection, status: JsonObject): void { connection.notify("remoteControl/status/changed", { ...status, status: "disabled", environmentId: null }); }
  detach(_connection: Connection): void {}
}
