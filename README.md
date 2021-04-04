# typestub-node-lmdb

Typescript wrapper around node-lmdb, with some improvement.

[![npm Package Version](https://img.shields.io/npm/v/typestub-node-lmdb.svg?maxAge=2592000)](https://www.npmjs.com/package/typestub-node-lmdb)

Basically same as node-lmdb, except:

- `beginTxn()` is exposed only after the `env` is opened
- extended `txn` to include `clear`, `getObject`, and `putObject` methods

| additional method | explanation                                                  |
| ----------------- | ------------------------------------------------------------ |
| clear             | try to delete, will not throw error if the key doesn't exist |
| getObject         | wrap around getString with JSON.stringify\*                  |
| putObject         | wrap around putString with JSON.parse\*                      |

\*: exception raised from JSON.stringify/parse is not handled
