import "./reactCOIServiceWorker";
import { IAuroWallet, MinaProvider, PassportCred, Proved, zkcMina, ZkSybil } from "@sybil-center/zkc-o1js";
import { JsonProof, PublicKey } from "o1js";
import { useEffect, useState } from "react";
import { ZkProgWorkerClient } from "@/service/zk-prog-worker.client";
import styles from "@/styles/Home.module.css";
import Head from "next/head";
import GradientBG from "@/components/GradientBG";
import { CredModal } from "@/components/CredModal";
import { timeout } from "@/util/index";

type ZkProgState = {
  loading: boolean;
  error: string;
  workerClient: ZkProgWorkerClient | null;
  compiled: boolean;
  verificationKey: string | null;
  proof: JsonProof | null;
  authenticated: boolean;
}

const initZkProgState: ZkProgState = {
  authenticated: false,
  loading: false,
  error: "",
  workerClient: null,
  compiled: false,
  verificationKey: "",
  proof: null
};

type ZkCredState = {
  loading: boolean;
  error: string;
  zkCred: Proved<PassportCred> | null;
}

const initZkCredState: ZkCredState = {
  loading: false,
  error: "",
  zkCred: null
};

type WalletState = {
  wallet: null | IAuroWallet,
  address: PublicKey | null
}

const initWalletState: WalletState = {
  wallet: null,
  address: null
};

const sybil = new ZkSybil(new URL("https://api.dev.sybil.center"));

function prettyKey(key58: string): string {
  const chars = key58.split("");
  const prefix: string[] = [];
  for (let i = 0; i < 5; i++) {
    prefix.push(chars[i]);
  }
  const postfix: string[] = [];
  for (let i = chars.length - 1; i > chars.length - 6; i--) {
    postfix.push(chars[i]);
  }
  return `${prefix.join("")}...${postfix.join("")}`;
}

export default function Home() {

  const [zkProgState, setZkProgState] = useState(initZkProgState);
  const [zkCredState, setZkCredState] = useState(initZkCredState);
  const [walletState, setWalletState] = useState(initWalletState);
  const [showCred, setShowCred] = useState(false);
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    (async () => {
      if (!setup) {
        const minaWallet = (window as any).mina as IAuroWallet | null;
        setWalletState((prev) => ({ ...prev, wallet: minaWallet }));
        const workerClient = new ZkProgWorkerClient();
        await timeout(8 * 1000);
        console.log(`Worker client initialized`);
        const verificationKey = await workerClient.compileZkProgram();
        setZkProgState((prev) => ({
          ...prev,
          workerClient: workerClient,
          verificationKey: verificationKey,
          compiled: true
        }));
        setSetup(true);
      }
    })();
  }, []);

  function _getWallet(): IAuroWallet {
    const wallet = walletState.wallet;
    if (wallet) return wallet;
    throw new Error("Connect to wallet first");
  }


  async function _getAddress(): Promise<PublicKey> {
    return PublicKey.fromBase58((await _getWallet().requestAccounts())[0]);
  }

  async function onWalletConnect() {
    const address = await _getAddress();
    setWalletState((prev) => ({ ...prev, address: address }));
  }

  async function onGetCred() {
    try {
      setZkCredState((prev) => ({
        ...prev,
        loading: true
      }));
      const minaProvider = new MinaProvider(_getWallet());
      const zkCred = await sybil.credential(
        "passport",
        await minaProvider.getProof(),
        { options: { mina: { network: "mainnet" } } }
      );
      const verified = await zkcMina.verifyCred(zkCred);
      if (!verified) throw new Error(`ZK credential is not verified`);
      setZkCredState((prev) => ({ ...prev, zkCred }));
    } catch (e) {
      setZkCredState((prev) => ({
        ...prev,
        error: String(e)
      }));
      setTimeout(() => {setZkCredState(initZkCredState);}, 3000);
    } finally {
      setZkCredState((prev) => ({ ...prev, loading: false }));
    }
  }

  function _getZkCred(): Proved<PassportCred> {
    const zkCred = zkCredState.zkCred;
    if (zkCred) return zkCred;
    throw new Error("Get Zk credential first");
  }

  async function onCreateZkProof() {
    try {
      setZkProgState((prev) => ({ ...prev, loading: true }));
      const proof = await zkProgState.workerClient?.auth(_getZkCred());
      console.log(JSON.stringify(proof, null, 1));
      setZkProgState((prev) => ({ ...prev, proof: proof! }));
    } catch (e) {
      setZkProgState((prev) => ({ ...prev, error: String(e) }));
      setTimeout(() => setZkProgState(initZkProgState), 3000);
    } finally {
      setZkProgState((prev) => ({ ...prev, loading: false }));
    }
  }

  function _getZkProof(): JsonProof {
    const proof = zkProgState.proof;
    if (proof) return proof;
    throw new Error(`Auth credential by ZK program first`);
  }

  async function onVerifyProof() {
    try {
      setZkProgState((prev) => ({ ...prev, loading: true }));
      const proof = _getZkProof();
      console.log("Start verify");
      const verified = await zkProgState.workerClient?.verify(proof);
      console.log("End verify");
      console.log(`verification result ${verified}`);
      if (!verified) throw new Error(`ZK proof is not verified`);
      setZkProgState((prev) => ({ ...prev, authenticated: verified }));
    } catch (e) {
      setZkProgState((prev) => ({ ...prev, error: String(e) }));
      setTimeout(() => setZkProgState((prev) => ({
        ...prev, error: ""
      })), 2000);
    } finally {
      setZkProgState((prev) => ({ ...prev, loading: false }));
    }
  }

  const walletComponent = () => {
    if (!walletState.wallet) {
      return (
        <a href={"https://www.aurowallet.com/"} target="_blank" rel="noreferrer">
          <div>
            Install Auro Wallet
          </div>
        </a>
      );
    } else if (walletState.wallet && !walletState.address) {
      return (
        <button className={styles.card} onClick={onWalletConnect}>
          Connect your wallet
        </button>
      );
    } else {
      return (
        <div className={styles.card}>
          Connected: {prettyKey(walletState.address!.toBase58())}
        </div>
      );
    }
  };

  const zkCredComponent = () => {
    if (zkCredState.error) return (
      <div>
        Something went wrong ...
      </div>
    );
    if (zkCredState.loading) {
      return (
        <div>
          Loading ...
        </div>
      );
    }
    if (!walletState.address) return (
      <div>
        Connect wallet first
      </div>
    );
    if (walletState.address && !zkCredState.zkCred) {
      return (
        <button className={styles.card} onClick={onGetCred}>
          Get Passport ZK Credential
        </button>
      );
    }
    if (zkCredState.zkCred) {
      return (
        <button className={styles.card} onClick={() => setShowCred(true)}>
          Show Passport ZK credential
        </button>
      );
    }
    return (<div onClick={onWalletConnect}>
      connect to the wallet first
    </div>);
  };

  const zkProgComponent = () => {
    if (!setup) return (<div>ZK program compiling ...</div>);
    if (zkProgState.authenticated) return (
      <div className={styles.card}>
        You proved Passport credential
      </div>
    );
    if (!zkCredState.zkCred) return (
      <div>
        Get credential first
      </div>
    );
    if (zkProgState.error) return (
      <div>
        Something went wrong ...
      </div>
    );
    if (zkProgState.loading) return (
      <div>
        Loading ...
      </div>
    );
    if (!zkProgState.proof) return (
      <button className={styles.card} onClick={onCreateZkProof}>
        Create ZK Auth proof
      </button>
    );
    if (zkProgState.proof) return (
      <button className={styles.card} onClick={onVerifyProof}>
        Verify ZK Auth proof
      </button>
    );
  };

  return (
    <>
      <Head>
        <title>ZKC in Action</title>
        <meta name="description" content="authenticate in ZKApp"/>
      </Head>
      <GradientBG>
        <main className={styles.main}>
          <CredModal credential={zkCredState.zkCred}
                     isOpen={showCred}
                     setIsOpen={setShowCred}/>
          <div>
            Prove Passport Credential using Zero-Knowledge credential
          </div>
          <div className={styles.center}>
            {walletComponent()}
            {zkCredComponent()}
          </div>
          {zkProgComponent()}

          <a href={"https://www.craft.me/s/fP61xnwdZ9GZmg"} target="_blank" rel="noreferrer">
            <button className={styles.card}>
              What is ZK credentials ?
            </button>
          </a>
        </main>
      </GradientBG>

    </>
  );

}


