import { Math512Bits, SafeMath } from '../libraries';
import { u256 } from 'as-bignum/assembly/index';

describe('Math512Bits mulShiftRoundDown', () => {
  test('mulShiftRoundDown', () => {
    const x = 5,
      y = 3,
      offset = 2;
    const res = Math512Bits.mulShiftRoundDown(
      u256.fromU64(x),
      u256.fromU64(y),
      offset,
    );
    const expected = u256.from((x * y) >> offset);
    expect(res).toStrictEqual(expected);
  });
  test('big values', () => {
    const x = u256.fromU64(U64.MAX_VALUE),
      y = u256.fromU64(2 ** 16),
      offset = 5;
    const res = Math512Bits.mulShiftRoundDown(x, y, offset);
    const expected = u256.shr(u256.mul(x, y), offset);
    expect(res).toStrictEqual(expected);
  });
});
describe('Math512Bits mulDivRoundDown', () => {
  test('mulDivRoundDown', () => {
    const x = 5,
      y = 3,
      z = 2;
    const res = Math512Bits.mulDivRoundDown(
      u256.fromU64(x),
      u256.fromU64(y),
      u256.fromU64(z),
    );
    const expected = u256.from(7);
    expect(res).toStrictEqual(expected);
  });
  test('big values', () => {
    const x = u256.fromU64(U64.MAX_VALUE),
      y = u256.fromU64(2 ** 16),
      z = 13953;
    const res = Math512Bits.mulDivRoundDown(x, y, u256.fromU64(z));
    const expected = u256.div(u256.mul(x, y), u256.fromU64(z));
    expect(res).toStrictEqual(expected);
  });
});
describe('Math512Bits shiftDivRoundDown', () => {
  test('shiftDivRoundDown', () => {
    const x = 5,
      y = 3,
      offset = 2;
    const res = Math512Bits.shiftDivRoundDown(
      u256.fromU64(x),
      offset,
      u256.fromU64(y),
    );
    const expected = u256.from(6);
    expect(res).toStrictEqual(expected);
  });
  test('big values', () => {
    const x = u256.fromU64(U64.MAX_VALUE),
      y = u256.fromU64(2 ** 16),
      offset = 16;
    const res = Math512Bits.shiftDivRoundDown(x, offset, y);
    const expected = u256.div(u256.shl(x, offset), y);
    expect(res).toStrictEqual(expected);
  });
});
describe('Math512Bits shiftDivRoundUp', () => {
  test('shiftDivRoundDown', () => {
    const x = 15,
      y = 16,
      offset = 3;
    const res = Math512Bits.shiftDivRoundUp(
      u256.fromU64(x),
      offset,
      u256.fromU64(y),
    );
    const expected = u256.from(8);
    expect(res).toStrictEqual(expected);
  });
  test('big values', () => {
    const x = u256.fromU64(U64.MAX_VALUE),
      y = u256.fromU64(2 ** 16),
      offset = 16;
    const res = Math512Bits.shiftDivRoundUp(x, offset, y);
    const expected = u256.div(u256.shl(x, offset), y);
    expect(res).toStrictEqual(expected);
  });
});
describe('Math512Bits mulShiftRoundUp', () => {
  test('mulShiftRoundUp', () => {
    const x = 8,
      y = 3,
      offset = 2;
    const res = Math512Bits.mulShiftRoundUp(
      u256.fromU64(x),
      u256.fromU64(y),
      offset,
    );
    const expected = u256.from((x * y) >> offset);
    expect(res).toStrictEqual(expected);
  });
  test('big values', () => {
    const x = u256.fromU64(U64.MAX_VALUE),
      y = u256.fromU64(2 ** 16),
      offset = 5;
    const res = Math512Bits.mulShiftRoundUp(x, y, offset);
    const expected = u256.shr(u256.mul(x, y), offset);
    expect(res).toStrictEqual(expected);
  });
});
