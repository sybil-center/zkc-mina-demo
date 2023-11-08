import { Experimental, Field, JsonProof, Poseidon, PublicKey, Signature, Struct, UInt64, verify } from "o1js";
import { o1jsSybil, PassportCred, SybilPreparator } from "@sybil-center/zkc-o1js";

type PreparedSign = [
  Signature,
  Field,
  PublicKey
]

type PreparedAttr = [
  Field,
  Field,
  Field,
  Field,
  PublicKey,
  Field,
  Field,
  Field,
  Field,
  Field,
  Field
]

const FROM_1900_TO_1970_MS = -(new Date("1900-01-01T00:00:00.000Z").getTime());
const YEARS_18_MS = UInt64.from(18 * 365 * 24 * 60 * 60 * 1000);

export class VerifyInputs extends Struct({
  subject: PublicKey,
  today: UInt64,
  issuer: PublicKey
}) {}

const verifyZkProgram = Experimental.ZkProgram({
  publicInput: VerifyInputs,
  methods: {
    auth: {
      privateInputs: [
        Signature,
        Field,
        PublicKey,
        Field,
        Field,
        Field,
        Field,
        PublicKey,
        Field,
        Field,
        Field,
        Field,
        Field,
        Field
      ],
      method(
        verifyInputs: VerifyInputs,
        signature: Signature,
        isr_id_t: Field,
        isr_id_k: PublicKey,
        sch: Field,
        isd: Field,
        exd: Field,
        sbj_id_t: Field,
        sbj_id_k: PublicKey,
        sbj_bd: Field,
        sbj_cc: Field,
        sbj_doc_id: Field,
        sbj_doc_t: Field,
        sbj_fn: Field,
        sbj_ln: Field
      ) {
        verifyInputs.issuer.assertEquals(isr_id_k);
        verifyInputs.subject.assertEquals(sbj_id_k);
        verifyInputs.today.sub(YEARS_18_MS).assertGreaterThanOrEqual(UInt64.from(sbj_bd));
        const hash = Poseidon.hash([
          sch,
          isd,
          exd,
          sbj_id_t,
          ...sbj_id_k.toFields(),
          sbj_bd,
          sbj_cc,
          sbj_doc_id,
          sbj_doc_t,
          sbj_fn, sbj_ln
        ]);
        const verified = signature.verify(isr_id_k, [hash]);
        verified.assertTrue();
      }
    }
  }
});

type State = {
  programCompiled: boolean;
  verificationKey: string | null;
}

const state: State = {
  programCompiled: false,
  verificationKey: null
};


export const ZK_PROG_FUNCTIONS = {

  compileZkProgram: async ({}): Promise<string> => {
    const { verificationKey } = await verifyZkProgram.compile();
    state.programCompiled = true;
    state.verificationKey = verificationKey;
    return verificationKey;
  },

  auth: async (
    zkCred: PassportCred
  ): Promise<JsonProof> => {
    if (!state.programCompiled) throw new Error("Compile ZK Program first");
    console.log("Worker: start creating proof");
    const now = new Date();
    const today = UInt64.from(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).getTime() + FROM_1900_TO_1970_MS
    );
    const preparator = o1jsSybil.getPreparator<SybilPreparator>();
    const preparedAttr = preparator.getPreparedAttributes<PreparedAttr>(zkCred, {
      proof: { type: "Mina:PoseidonPasta" },
      schema: "pre"
    });
    console.log("Prepared attributes", preparedAttr);
    const [
      sign,
      isr_id_t,
      isr_id_k
    ] = preparator.getPreparedSign<PreparedSign>(zkCred, {
      proof: { type: "Mina:PoseidonPasta" },
      schema: "pre"
    });
    console.log("sign", sign.toBase58());
    console.log("isr_id_t", isr_id_t.toBigInt());
    console.log("isr_id_k", isr_id_k.toBase58());
    console.log("Start zkc authentication");
    const proof = await verifyZkProgram.auth(
      new VerifyInputs({
        subject: preparedAttr[4],
        today: today,
        issuer: isr_id_k
      }),
      sign,
      isr_id_t,
      isr_id_k,
      ...preparedAttr
    );
    console.log(`Worker: proof created`);
    console.log("Worker: proof", proof.toJSON());
    return proof.toJSON();
  },

  verify: async (proof: JsonProof): Promise<boolean> => {
    if (state.verificationKey) return verify(proof, state.verificationKey);
    throw new Error(`Worker: compile ZK program first`);
  }
};

export type WorkerFns = {
  [K in keyof typeof ZK_PROG_FUNCTIONS]: {
    args: Parameters<(typeof ZK_PROG_FUNCTIONS)[K]>[0],
    result: Awaited<ReturnType<(typeof ZK_PROG_FUNCTIONS)[K]>>
  }
}

export type ZkProgWorkerReq<
  TKey extends keyof WorkerFns = keyof WorkerFns
> = {
  id: number;
  fn: TKey;
  args: WorkerFns[TKey]["args"];
}

export type ZkProgWorkerResp<
  TKey extends keyof WorkerFns = keyof WorkerFns
> = {
  id: number;
  data: WorkerFns[TKey]["result"]
}

if (typeof window !== "undefined") {
  addEventListener(
    "message",
    async (event: MessageEvent<ZkProgWorkerReq>) => {
      // @ts-ignore
      const returnData = await ZK_PROG_FUNCTIONS[event.data.fn](event.data.args);

      const message: ZkProgWorkerResp = {
        id: event.data.id,
        data: returnData,
      };
      postMessage(message);
    }
  );
}

console.log("Web Worker Successfully Initialized.");
