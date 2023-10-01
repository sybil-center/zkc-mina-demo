import { Dispatch, SetStateAction } from "react";
import ReactDom from "react-dom";
import styles from "../styles/Home.module.css";


type Props = {
  credential: any;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>
}

export function CredModal({
  credential,
  isOpen,
  setIsOpen
}: Props) {

  function onOverClick() {
    setIsOpen(false);
  }

  if (!isOpen) return <></>;
  return ReactDom.createPortal(
    <>
      <div onClick={onOverClick} className={styles.overlay}>
        <div className={styles.modal}>
          <pre className={styles.pre}>
            {JSON.stringify(credential, null, 2)}
          </pre>
        </div>
      </div>
    </>,
    document.getElementById("cred-modal")!);
}