// reference: https://github.com/Venemo/node-lmdb/blob/master/README.md

// tslint:disable-next-line:no-var-requires
const lmdb = require('node-lmdb');

export type Dbi = {
  close(): void;
  drop(options?: { txn: Txn }): void;
};

export type Key = string | number | boolean | Buffer;

export type KeyType =
  | { keyIsUint32?: boolean }
  | { keyIsBuffer?: boolean }
  | { keyIsString?: boolean };

export type ReadonlyTxn = {
  getString(dbi: Dbi, key: Key, keyType?: KeyType): string | null;
  getBinary(dbi: Dbi, key: Key, keyType?: KeyType): Buffer | null;
  getNumber(dbi: Dbi, key: Key, keyType?: KeyType): number | null;
  getBoolean(dbi: Dbi, key: Key, keyType?: KeyType): boolean | null;
  commit(): void;
  abort(): void;
  // use reset() and renew() before create cursor on a new DBi
  // details refers to https://github.com/Venemo/node-lmdb/issues/41#issuecomment-181789186
  reset(): void;
  renew(): void;
};
export type Txn = ReadonlyTxn & {
  putString(dbi: Dbi, key: Key, value: string | null, keyType?: KeyType): void;
  putBinary(dbi: Dbi, key: Key, value: Buffer, keyType?: KeyType): void;
  putNumber(dbi: Dbi, key: Key, value: number | null, keyType?: KeyType): void;
  putBoolean(
    dbi: Dbi,
    key: Key,
    value: boolean | null,
    keyType?: KeyType,
  ): void;
  del(dbi: Dbi, key: Key, keyType?: KeyType): void;
};
export type ExtendedReadonlyTxn = ReadonlyTxn & {
  getObject<T>(dbi: Dbi, key: Key, keyType?: KeyType): T | null;
  getAny<T>(
    dbi: Dbi,
    key: Key,
    keyType?: KeyType,
  ): string | Buffer | number | boolean | T | null;
};
export type ExtendedTxn = Txn &
  ExtendedReadonlyTxn & {
    putObject<T>(dbi: Dbi, key: Key, value: T | null, keyType?: KeyType): void;
    // delete if exist
    clear(dbi: Dbi, key: Key, keyType?: KeyType): void;
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

function extendReadonlyTxn<T extends ReadonlyTxn>(
  txn: T,
): T & ExtendedReadonlyTxn {
  const self = Object.assign(txn, {
    getObject<T>(dbi: Dbi, key: Key, keyType?: KeyType): T | null {
      const value = txn.getString(dbi, key, keyType);
      if (value === null) {
        return null;
      }
      return JSON.parse(value);
    },
    getAny<T>(
      dbi: Dbi,
      key: Key,
      keyType?: KeyType,
    ): string | Buffer | number | boolean | T | null {
      const bin = txn.getBinary(dbi, key, keyType);
      if (bin === null) {
        return null;
      }
      if (bin.length === 1) {
        switch (bin[0]) {
          case 0:
            return false;
          case 1:
            return true;
        }
      }
      try {
        return self.getObject(dbi, key, keyType);
      } catch (e) {
        // not object
      }
      try {
        const str = txn.getString(dbi, key, keyType)!;
        let ok = true;
        for (let i = 0; i < str.length; i++) {
          if (str.charCodeAt(i) === 0) {
            ok = false;
            break;
          }
        }
        if (ok) {
          return str;
        }
      } catch (e) {
        // not string
      }
      if (bin.length === 8) {
        try {
          return txn.getNumber(dbi, key, keyType);
        } catch (e) {
          // not number
        }
      }
      return bin;
    },
  });
  return self;
}

function extendTxn<T extends Txn>(txn: T): T & ExtendedTxn {
  return Object.assign(extendReadonlyTxn(txn), {
    putObject(dbi: Dbi, key: Key, value: any, keyType?: KeyType): void {
      txn.putString(dbi, key, JSON.stringify(value), keyType);
    },
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
  });
}

export function newEnv() {
  const env = new lmdb.Env();
  return {
    open(options: { path: string; mapSize?: number; maxDbs?: number }) {
      env.open(options);

      function beginTxn(
        options?: { readOnly?: false } | undefined,
      ): ExtendedTxn;
      function beginTxn(options: { readOnly: true }): ExtendedReadonlyTxn;
      function beginTxn(options?: {
        readOnly?: boolean;
      }): ExtendedTxn | ExtendedReadonlyTxn {
        const txn = env.beginTxn(options);
        if (options && options.readOnly) {
          return extendReadonlyTxn(txn as ReadonlyTxn);
        }
        return extendTxn(txn as Txn);
      }

      // methods of opened env
      return {
        close() {
          env.close();
        },
        // methods of opened dbi
        openDbi(options: OpenDbiOptions) {
          const dbi = env.openDbi(options);
          return dbi as Dbi;
        },
        beginTxn,
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
