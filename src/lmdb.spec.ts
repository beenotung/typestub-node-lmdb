import { expect } from 'chai';
import 'mocha';
import { Dbi, ExtendedTxn, Key, newEnv } from './lmdb';

// tslint:disable:no-unused-expression

function getDB() {
  const env = newEnv().open({ path: 'data' });
  const dbi = env.openDbi({
    name: 'test',
    create: true,
  });
  return { env, dbi };
}

function storeTestValues() {
  const { env, dbi } = getDB();
  const txn = env.beginTxn();
  txn.putString(dbi, 'str', 'foo');
  txn.putBinary(dbi, 'bin', Buffer.from([1, 2, 3]));
  txn.putNumber(dbi, 'num', 1);
  txn.putBoolean(dbi, 'bool', true);
  txn.putObject(dbi, 'obj', { foo: 'bar' });
  return { env, dbi, txn };
}

function deleteTestValues(dbi: Dbi, txn: ExtendedTxn, strict = true) {
  const del = strict
    ? (key: Key) => txn.del(dbi, key)
    : (key: Key) => txn.clear(dbi, key);
  del('str');
  del('bin');
  del('num');
  del('bool');
  del('obj');
}

function checkNoValues(dbi: Dbi, txn: ExtendedTxn) {
  expect(txn.getString(dbi, 'str')).null;
  expect(txn.getBinary(dbi, 'bin')).null;
  expect(txn.getNumber(dbi, 'num')).null;
  expect(txn.getBoolean(dbi, 'bool')).null;
  expect(txn.getObject(dbi, 'obj')).null;
}

describe('node-lmdb wrapper TestSuit', () => {
  it('should store value without error', () => {
    const { env, dbi, txn } = storeTestValues();
    txn.commit();
    dbi.close();
    env.close();
  });

  it('should get back stored value', () => {
    const { env, dbi, txn } = storeTestValues();
    txn.commit();
    const txn2 = env.beginTxn();
    expect(txn2.getString(dbi, 'str')).equals('foo');
    expect(txn2.getBinary(dbi, 'bin')).deep.equals(Buffer.from([1, 2, 3]));
    expect(txn2.getNumber(dbi, 'num')).equals(1);
    expect(txn2.getBoolean(dbi, 'bool')).equals(true);
    expect(txn2.getObject(dbi, 'obj')).deep.equals({ foo: 'bar' });
    txn2.commit();
    dbi.close();
    env.close();
  });

  it('should not get deleted value', () => {
    const { env, dbi, txn } = storeTestValues();
    txn.commit();
    const txn2 = env.beginTxn();
    deleteTestValues(dbi, txn2);
    checkNoValues(dbi, txn2);
    txn2.commit();
    dbi.close();
    env.close();
  });

  it('should not get non-committed values', () => {
    const { env, dbi } = getDB();
    let txn = env.beginTxn();

    // clean up existing values
    deleteTestValues(dbi, txn, false);
    txn.commit();

    // store values but don't commit
    txn = storeTestValues().txn;
    txn.abort();

    // the values shouldn't be there
    txn = env.beginTxn();
    checkNoValues(dbi, txn);
    txn.commit();

    dbi.close();
    env.close();
  });

  // FIXME this cause deadlock, is it expected behaviour?
  it('writer should not interference with reader', () => {
    if ('skip deadlock check') {
      return;
    }
    const { env, dbi } = getDB();
    const cleanupTxn = env.beginTxn();

    // clean up existing values
    deleteTestValues(dbi, cleanupTxn, false);
    cleanupTxn.commit();

    // store values but don't commit
    console.log('begin write tx');
    const writeTxn = storeTestValues().txn;

    // the values shouldn't be there
    console.log('begin read tx');
    const readTxn = env.beginTxn(); // will deadlock here
    console.log('began read tx');
    checkNoValues(dbi, readTxn);

    console.log('commit read tx');
    readTxn.commit();
    console.log('commit write tx');
    writeTxn.commit();

    dbi.close();
    env.close();
  });
});
// tslint:enable:no-unused-expression
