import { i128, u128, u256 } from 'as-bignum/assembly';
import {
  BinHelper,
  SCALE_OFFSET,
  BASIS_POINT_MAX,
  REAL_ID_SHIFT,
  Math512Bits,
  PRECISION,
  ID_ONE,
} from '../libraries';

function assertClose(x: u256, y: u256): void {
  // take advantage of compile time errors
  if (!(x instanceof u256)) {
    ERROR('assertClose should only be called with u256!');
  }

  // Tell the host the actual and expected values
  Actual.report(x.toString());
  Expected.report(y.toString());

  // check that x is close to y (within 0.001%)
  const diff = x > y ? u256.sub(x, y) : u256.sub(y, x);
  const isClose = diff < u256.div(x, u256.from(100000));

  // use assert function with message
  assert(isClose, 'x should be closer to y');

  // Clear the host actual and expected values afterwards
  Actual.clear();
  Expected.clear();
}

describe('BinHelper', () => {
  const binStep = 1 as u64;
  const id = 8000000 as u64;

  test('Get BP value', () => {
    const res = BinHelper._getBPValue(binStep);
    const expected = u256.add(
      u256.shl(u256.One, 128),
      u256.div(u256.shl(u256.from(binStep), 128), u256.from(10_000)),
    );
    expect(res.toString()).toStrictEqual(expected.toString());
  });
  test('Get price from id', () => {
    const res = BinHelper.getPriceFromId(id, binStep);
    const expected = BinHelper.power(
      BinHelper._getBPValue(binStep),
      id - REAL_ID_SHIFT,
    );
    expect(res.toString()).toStrictEqual(expected.toString());
  });
  test('Get price from id middle', () => {
    const _id = ID_ONE;
    const res = BinHelper.getPriceFromId(_id, binStep);
    const expected = u256.shl(u256.One, SCALE_OFFSET);
    expect(res.toString()).toStrictEqual(expected.toString());
  });
});

describe('Math128x128 power', () => {
  test('PowerSquare', () => {
    const _binStep: u64 = 100;
    const x = u256.add(
      u256.shl(u256.One, SCALE_OFFSET),
      u256.div(
        u256.shl(u256.from(_binStep), SCALE_OFFSET),
        u256.from(BASIS_POINT_MAX),
      ),
    );
    const y: i64 = 2;
    const res = BinHelper.power(x, y);
    const expected = convertDecimalPriceTo128x128(
      u256.mul(
        u256.mul(u256.from(10201), u256.from(10 ** 7)),
        u256.from(10 ** 7),
      ),
    );
    assertClose(res, expected);
  });
  test('PowerCube', () => {
    const _binStep: u64 = 1;

    const x = u256.add(
      u256.shl(u256.One, SCALE_OFFSET),
      u256.div(
        u256.shl(u256.from(_binStep), SCALE_OFFSET),
        u256.from(BASIS_POINT_MAX),
      ),
    );
    const y: i64 = 3;
    const res = BinHelper.power(x, y);
    const expected = convertDecimalPriceTo128x128(
      u256.mul(u256.from(1000300030001), u256.from(10 ** 6)),
    );
    assertClose(res, expected);
  });
  test('PowerBig', () => {
    const _binStep: u64 = 1;

    const x = u256.add(
      u256.shl(u256.One, SCALE_OFFSET),
      u256.div(
        u256.shl(u256.from(_binStep), SCALE_OFFSET),
        u256.from(BASIS_POINT_MAX),
      ),
    );
    const y: i64 = 10000;
    const res = BinHelper.power(x, y);
    const expected = convertDecimalPriceTo128x128(
      u256.from(u128.from('2718145926825224864')),
    );
    assertClose(res, expected);
  });
  test('PowerBigBinStep10', () => {
    const _binStep: u64 = 10;

    const x = u256.add(
      u256.shl(u256.One, SCALE_OFFSET),
      u256.div(
        u256.shl(u256.from(_binStep), SCALE_OFFSET),
        u256.from(BASIS_POINT_MAX),
      ),
    );
    const y: i64 = 10000;
    const res = BinHelper.power(x, y);
    const expected = convertDecimalPriceTo128x128(
      u256.from(u128.from('21916681339078427043784')),
    );
    assertClose(res, expected);
  });
  test('PowerOne', () => {
    const _binStep: u64 = 1;
    const x = u256.add(
      u256.shl(u256.One, SCALE_OFFSET),
      u256.div(
        u256.shl(u256.from(_binStep), SCALE_OFFSET),
        u256.from(BASIS_POINT_MAX),
      ),
    );
    const y: i64 = 1;
    const res = BinHelper.power(x, y);
    const expected = x;
    expect(res.toString()).toStrictEqual(expected.toString());
  });
  test('PowerInv', () => {
    const _binStep: u64 = 1;
    const x = u256.add(
      u256.shl(u256.One, SCALE_OFFSET),
      u256.div(
        u256.shl(u256.from(_binStep), SCALE_OFFSET),
        u256.from(BASIS_POINT_MAX),
      ),
    );
    const y: i64 = -1;
    const res = BinHelper.power(x, y);
    const expected = convertDecimalPriceTo128x128(
      u256.from(999900009999000099),
    );
    assertClose(res, expected);
  });
  test('PowerInvBis', () => {
    const _binStep: u64 = 1;
    const x = u256.add(
      u256.shl(u256.One, SCALE_OFFSET),
      u256.div(
        u256.shl(u256.from(_binStep), SCALE_OFFSET),
        u256.from(BASIS_POINT_MAX),
      ),
    );
    const y: i64 = -2;
    const res = BinHelper.power(x, y);
    const expected = convertDecimalPriceTo128x128(
      u256.from(999800029996000499),
    );
    assertClose(res, expected);
  });
  test('PowerInvBig', () => {
    const _binStep: u64 = 1;
    const x = u256.add(
      u256.shl(u256.One, SCALE_OFFSET),
      u256.div(
        u256.shl(u256.from(_binStep), SCALE_OFFSET),
        u256.from(BASIS_POINT_MAX),
      ),
    );
    const y: i64 = -10000;
    const res = BinHelper.power(x, y);
    const expected = convertDecimalPriceTo128x128(
      u256.from(367897834377123709),
    );
    assertClose(res, expected);
  });
});

// describe("Math128x128 log2", () => {
//     test("log2", () => {
//         const res = BinHelper.log2(u128.from(2));
//         print64x64(res);
//         const expected = i128.shl(i128.One, 64);

//         expect(res).toStrictEqual(expected);
//     });
// });

// function print32x32(x: u64): void {
//     const resBinary = x.toString(2).padStart(64, "0");
//     log<string>(x.toString());
//     log<string>(resBinary.slice(0, 32) + "." + resBinary.slice(32, 64));
//     log<string>(u32x32ToF64(x).toString());
// }

// function print64x64(x: i128): void {
//     const resBinary = x.
//     log<string>(x.toString());
//     log<string>(resBinary.slice(0, 64) + "." + resBinary.slice(64, 128));
// }

// function u32x32ToF64(x: u64): f64 {
//     const resBinary = x.toString(2).padStart(64, "0");
//     const ent = parseInt(resBinary.slice(0, 32), 2) as f64;
//     const dec = parseInt(resBinary.slice(32, 64), 2) as f64;
//     return ent + dec / 0x100000000;
// }

function convertDecimalPriceTo128x128(price: u256): u256 {
  return Math512Bits.shiftDivRoundDown(price, SCALE_OFFSET, PRECISION);
}
