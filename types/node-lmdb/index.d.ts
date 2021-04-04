/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'node-lmdb' {
  type Txn = any;

  type Dbi = {
    close(): void;
    drop(options?: { txn: Txn }): void;
  };

  type KeyType =
    | { keyIsUint32?: boolean }
    | { keyIsBuffer?: boolean }
    | { keyIsString?: boolean };

  type OpenDbiOptions = {
    name: string | null;
    create?: boolean;
    txn?: Txn;
  } & KeyType &
    (
      | {
          // allow duplicated key and sort values
          dupSort?: boolean;
        }
      | {
          dupSort: true;
          // specify the values are same length to allow optimization for cursor
          dupFixed?: boolean;
        }
    );

  class Env {
    open(options: { path: string; mapSize?: number; maxDbs?: number });

    openDbi(options: OpenDbiOptions): Dbi;

    beginTxn(options?: { readOnly?: boolean }): Txn;

    close();
  }

  class Cursor {
    constructor(txn: Txn, dbi: Dbi, keyType?: KeyType);
  }
}
