import type { WriteReply, WriteRequest, WriteTransport } from "../browser-writes";

/** Scripted HTTP seam paired with fetchWriteTransport; no domain rules here. */
export class ScriptedWriteTransport implements WriteTransport {
  readonly requests: WriteRequest[] = [];
  constructor(private readonly replies: (WriteReply | Error)[]) {}
  async send(request: WriteRequest): Promise<WriteReply> {
    this.requests.push(structuredClone(request));
    const reply = this.replies.shift();
    if (!reply) throw new Error("No scripted reply");
    if (reply instanceof Error) throw reply;
    return reply;
  }
}
