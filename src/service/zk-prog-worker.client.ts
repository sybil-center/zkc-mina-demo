import { WorkerFns, ZK_PROG_FUNCTIONS, ZkProgWorkerReq, ZkProgWorkerResp, } from "@/service/zk-prog.worker";

import { PassportCred } from "@sybil-center/zkc-o1js";
import { JsonProof } from "o1js";

type IZkProgWorkerClient = typeof ZK_PROG_FUNCTIONS

export class ZkProgWorkerClient implements IZkProgWorkerClient {
  compileZkProgram(): Promise<string> {
    return this._call(
      "compileZkProgram",
      {}
    );
  }

  auth(zkCred: PassportCred): Promise<JsonProof> {
    return this._call("auth", zkCred);
  }

  verify(proof: JsonProof): Promise<boolean> {
    return this._call("verify", proof);
  }

  constructor() {
    this.worker = new Worker(new URL("./zk-prog.worker.ts", import.meta.url));
    this.promises = {};
    this.nextId = 0;

    this.worker.onmessage = (event: MessageEvent<ZkProgWorkerResp>) => {
      this.promises[event.data.id].resolve(event.data.data);
      delete this.promises[event.data.id];
    };
  }


  worker: Worker;

  promises: {
    [id: number]: { resolve: (res: any) => void; reject: (err: any) => void };
  };

  nextId: number;

  _call<
    TKey extends keyof WorkerFns
  >(
    fn: TKey,
    args: WorkerFns[TKey]["args"]
  ): Promise<WorkerFns[TKey]["result"]> {
    return new Promise((resolve, reject) => {
      this.promises[this.nextId] = { resolve, reject };

      const message: ZkProgWorkerReq<TKey> = {
        id: this.nextId,
        fn,
        args,
      };

      this.worker.postMessage(message);

      this.nextId++;
    });
  }
}
