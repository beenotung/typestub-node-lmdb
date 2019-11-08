// reference: https://github.com/Venemo/node-lmdb/blob/master/README.md

// tslint:disable-next-line:no-var-requires
const lmdb = require('node-lmdb');

export type Dbi = {
  close(): void;
  drop(): void;
};

export type Key = string | number | boolean | Buffer;

export type KeyType =
  | { keyIsUint32?: boolean }
  | { keyIsBuffer?: boolean }
  | { keyIsString?: boolean };

type Txn = {
  getString(dbi: Dbi, key: Key, keyType?: KeyType): string | null;
  getBinary(dbi: Dbi, key: Key, keyType?: KeyType): Buffer | null;
  getNumber(dbi: Dbi, key: Key, keyType?: KeyType): number | null;
  getBoolean(dbi: Dbi, key: Key, keyType?: KeyType): boolean | null;
  putString(dbi: Dbi, key: Key, value: string, keyType?: KeyType): void;
  putBinary(dbi: Dbi, key: Key, value: Buffer, keyType?: KeyType): void;
  putNumber(dbi: Dbi, key: Key, value: number, keyType?: KeyType): void;
  putBoolean(dbi: Dbi, key: Key, value: boolean, keyType?: KeyType): void;
  del(dbi: Dbi, key: Key, keyType?: KeyType): void;
  commit(): void;
  abort(): void;
  // use reset() and renew() before create cursor on a new DBi
  // details refers to https://github.com/Venemo/node-lmdb/issues/41#issuecomment-181789186
  reset(): void;
  renew(): void;
};
export type ExtendedTxn = Txn & {
  // delete if exist
  clear(dbi: Dbi, key: Key, keyType?: KeyType): void;
  getObject<T>(dbi: Dbi, key: Key, keyType?: KeyType): T | null;
  putObject<T>(dbi: Dbi, key: Key, value: T, keyType?: KeyType): void;
};

export type Cursor = {
  goToFirst(): Key | null;
  goToNext(): Key | null;
  goToKey(key: Key): void;
  goToRange(key: Key): void;
  getCurrentString(f: (key: Key, value: string) => void): void;
  getCurrentBinary(f: (key: Key, value: Buffer) => void): void;
  getCurrentNumber(f: (key: Key, value: number) => void): void;
  getCurrentBoolean(f: (key: Key, value: boolean) => void): void;
};

export function newEnv() {
  const env = new lmdb.Env();
  return {
    open(options: { path: string; mapSize?: number; maxDbs?: number }) {
      env.open(options);
      // methods of opened env
      return {
        close() {
          env.close();
        },
        // methods of opened dbi
        openDbi(
          options: {
            name: string;
            create?: boolean;
          } & KeyType,
        ) {
          const dbi = env.openDbi(options);
          return dbi as Dbi;
        },
        beginTxn(): ExtendedTxn {
          const txn = env.beginTxn() as Txn;
          return Object.assign(txn, {
            clear(dbi: Dbi, key: Key, keyType?: KeyType): void {
              try {
                txn.del(dbi, key, keyType);
              } catch (e) {
                // don't need to do anything if the key doesn't exist
                if (e.message.startsWith('MDB_NOTFOUND')) {
                  return;
                }
                throw e;
              }
            },
            getObject<T>(dbi: Dbi, key: Key, keyType?: KeyType): T | null {
              const value = txn.getString(dbi, key, keyType);
              if (value === null) {
                return null;
              }
              return JSON.parse(value);
            },
            putObject(dbi: Dbi, key: Key, value: any, keyType?: KeyType): void {
              txn.putString(dbi, key, JSON.stringify(value), keyType);
            },
          });
        },
      };
    },
  };
}

export type Env = ReturnType<typeof newEnv>;
export type OpenedEnv = ReturnType<Env['open']>;

export function newCursor(txn: Txn, dbi: Dbi, keyType?: KeyType) {
  const cursor = new lmdb.Cursor(txn, dbi, keyType);
  return cursor as Cursor;
}
