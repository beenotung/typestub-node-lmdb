import { expect } from 'chai';
import 'mocha';
import { Dbi, ExtendedReadonlyTxn, ExtendedTxn, Key, newCursor, newEnv } from '../src/lmdb';

// tslint:disable:no-unused-expression

function getDB() {
  const env = newEnv().open({
    path: 'data',
    maxDbs: 10,
  });
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

function checkNoValues(dbi: Dbi, txn: ExtendedReadonlyTxn) {
  expect(txn.getString(dbi, 'str')).null;
  expect(txn.getBinary(dbi, 'bin')).null;
  expect(txn.getNumber(dbi, 'num')).null;
  expect(txn.getBoolean(dbi, 'bool')).null;
  expect(txn.getObject(dbi, 'obj')).null;
}

describe('node-lmdb wrapper TestSuit', () => {

  it('should not allow readonly transaction doing mutation', () => {
    const { env, dbi } = getDB();
    let txn = env.beginTxn({ readOnly: true });
    if ('putString' in txn) {
      expect((txn as ExtendedTxn).putString.bind(txn, dbi, 'foo', 'bar')).to.throw('Permission denied');
    }
    txn.commit();
  });

  it('should allow writable transaction to store value without error', () => {
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

  it('should put null as value', () => {
    const { env, dbi } = getDB();
    const txn = env.beginTxn();
    txn.putString(dbi, 'foo', 'bar');

    txn.putString(dbi, 'foo', null);
    expect(txn.getString(dbi, 'foo')).equals('');

    // binary cannot be null, will raise runtime error (SIGABRT stop the whole VM)
    // txn.putBinary(dbi, 'foo', null as any);
    // expect(txn.getBinary(dbi, 'foo')).deep.equals(Buffer.from([]));

    txn.putNumber(dbi, 'foo', null);
    expect(txn.getNumber(dbi, 'foo')).equals(0);

    txn.putBoolean(dbi, 'foo', null);
    expect(txn.getBoolean(dbi, 'foo')).equals(false);

    txn.putObject(dbi, 'foo', null);
    expect(txn.getObject(dbi, 'foo')).equals(null);

    txn.commit();
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

  it('should be able to create new Dbi even after txn has began', () => {
    const { env, dbi } = getDB();

    // set value to a newly created Dbi in the middle of a txn
    const txn1 = env.beginTxn();
    txn1.putString(dbi, 'foo', 'bar');
    const newDbi = env.openDbi({
      name: Date.now() + Math.random().toString(36).split('.')[1],
      create: true,
      txn: txn1,
    });
    txn1.putString(newDbi, 'baz', 'buz');
    txn1.commit();

    // check back the values
    const txn2 = env.beginTxn();
    expect(txn2.getString(dbi, 'foo')).equals('bar');
    expect(txn2.getString(newDbi, 'baz')).equals('buz');
    txn2.commit();

    newDbi.drop();
    dbi.drop();
    env.close();
  });

  it('writer should not interference with reader', () => {
    const { env, dbi } = getDB();
    const cleanupTxn = env.beginTxn();

    // clean up existing values
    deleteTestValues(dbi, cleanupTxn, false);
    cleanupTxn.commit();

    // store values but don't commit
    const writeTxn = storeTestValues().txn;

    // the values shouldn't be there
    const readTxn = env.beginTxn({ readOnly: true });
    checkNoValues(dbi, readTxn);

    readTxn.commit();
    writeTxn.commit();

    dbi.close();
    env.close();
  });

  it('should be able to get value of any type', () => {
    const { env, dbi, txn } = storeTestValues();

    expect(txn.getAny(dbi, 'str')).equals('foo');
    expect(txn.getAny(dbi, 'bin')).deep.equals(Buffer.from([1, 2, 3]));
    expect(txn.getAny(dbi, 'num')).equals(1);
    expect(txn.getAny(dbi, 'bool')).equals(true);
    expect(txn.getAny(dbi, 'obj')).deep.equals({ foo: 'bar' });

    txn.putBoolean(dbi, 'true', true);
    txn.putBoolean(dbi, 'false', false);
    txn.putNumber(dbi, 'num', 42);
    txn.putNumber(dbi, 'zero', 0);
    txn.putNumber(dbi, 'one', 1);

    expect(txn.getAny(dbi, 'true')).equals(true);
    expect(txn.getAny(dbi, 'false')).equals(false);
    expect(txn.getAny(dbi, 'num')).equals(42);
    expect(txn.getAny(dbi, 'zero')).equals(0);
    expect(txn.getAny(dbi, 'one')).equals(1);

    txn.putBinary(dbi, '8bit', Buffer.from([1, 2, 3, 3, 4, 5, 6, 7, 8]));
    expect(txn.getAny(dbi, '8bit')).deep.equals(Buffer.from([1, 2, 3, 3, 4, 5, 6, 7, 8]));

    // cannot distinct before 7bit binary and number
    // txn.putBinary(dbi, '7bit', Buffer.from([1, 2, 3, 3, 4, 5, 6, 7]));
    // expect(txn.getAny(dbi, '7bit')).deep.equals(Buffer.from([1, 2, 3, 3, 4, 5, 6, 7]));
    // expect(typeof txn.getAny(dbi, '7bit')).equals('number');

    txn.commit();
  });

  it('should copy any value as binary', () => {
    const { env, dbi, txn } = storeTestValues();

    function copy(key: string) {
      const value = txn.getBinary(dbi, key)!;
      txn.putBinary(dbi, 'acc', value);
    }

    copy('str');
    expect(txn.getString(dbi, 'str')).equals('foo');

    copy('bin');
    expect(txn.getBinary(dbi, 'bin')).deep.equals(Buffer.from([1, 2, 3]));

    copy('num');
    expect(txn.getNumber(dbi, 'num')).equals(1);

    copy('bool');
    expect(txn.getBoolean(dbi, 'bool')).equals(true);

    copy('obj');
    expect(txn.getObject(dbi, 'obj')).deep.equals({ foo: 'bar' });

    txn.commit();
  });

  it('should be able to set any value type', () => {
    const { env, dbi } = getDB();
    const txn = env.beginTxn();
    const test = (value: any) => {
      txn.putAny(dbi, 'foo', value);
      expect(txn.getAny(dbi, 'foo')).deep.equals(value);
    };
    test('str');
    test(Buffer.from([1, 2, 3]));
    test(42);
    test(true);
    test(false);
    test({ foo: 'bar' });

    txn.commit();
  });

  it('should be able to scan all key/value pairs', () => {
    const { env, dbi } = getDB();
    const txn = env.beginTxn();
    const cursor = newCursor(txn, dbi);
    let key = cursor.goToFirst();
    while (key !== null) {
      let value = txn.getAny(dbi, key);
      key = cursor.goToNext();
    }
    txn.commit();
  });
});
// tslint:enable:no-unused-expression
