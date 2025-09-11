import { u256 } from 'as-bignum/assembly';
import { BitMath } from '../libraries';

describe('Most and least significant bit', () => {
  test('leastSignificantBit(1)', () => {
    const res = BitMath.leastSignificantBit(u256.One);
    const expected: u8 = 0;
    expect(res).toStrictEqual(expected);
  });
  test('leastSignificantBit(2)', () => {
    const res = BitMath.leastSignificantBit(u256.from(2));
    const expected: u8 = 1;
    expect(res).toStrictEqual(expected);
  });
  test('leastSignificantBit(212)', () => {
    const res = BitMath.leastSignificantBit(u256.from(212));
    const expected: u8 = 2;
    expect(res).toStrictEqual(expected);
  });
  test('leastSignificantBit(Max)', () => {
    const res = BitMath.leastSignificantBit(u256.Max);
    const expected: u8 = 0;
    expect(res).toStrictEqual(expected);
  });
  test('mostSignificantBit(1)', () => {
    const res = BitMath.mostSignificantBit(u256.One);
    const expected: u8 = 0;
    expect(res).toStrictEqual(expected);
  });
  test('mostSignificantBit(2)', () => {
    const res = BitMath.mostSignificantBit(u256.from(2));
    const expected: u8 = 1;
    expect(res).toStrictEqual(expected);
  });
  test('mostSignificantBit(212)', () => {
    const res = BitMath.mostSignificantBit(u256.from(212));
    const expected: u8 = 7;
    expect(res).toStrictEqual(expected);
  });
  test('mostSignificantBit(Max)', () => {
    const res = BitMath.mostSignificantBit(u256.Max);
    const expected: u8 = 255;
    expect(res).toStrictEqual(expected);
  });
  test('significantBit(129, true)', () => {
    const res = BitMath.significantBit(u256.from(129), true);
    const expected: u8 = 7;
    expect(res).toStrictEqual(expected);
  });
  test('significantBit(129, false)', () => {
    const res = BitMath.significantBit(u256.from(129), false);
    const expected: u8 = 0;
    expect(res).toStrictEqual(expected);
  });
});

describe('Closest bit', () => {
  test('closestBitRight(5, 6)', () => {
    const res = BitMath.closestBitRight(u256.from(0b00000101), 6);
    expect(res.unwrap()).toStrictEqual(2);
  });
  test('closestBitRight(189, 5)', () => {
    const res = BitMath.closestBitRight(u256.from(0b10111101), 5);
    expect(res.unwrap()).toStrictEqual(5);
  });
  test('closestBitLeft(Max, 50)', () => {
    const res = BitMath.closestBitLeft(u256.Max, 50);
    expect(res.unwrap()).toStrictEqual(50);
  });
  test('closestBitLeft(Max, 69)', () => {
    const res = BitMath.closestBitLeft(u256.Max, 69);
    expect(res.unwrap()).toStrictEqual(69);
  });
  test('closestBitLeft(189, 1)', () => {
    const res = BitMath.closestBitLeft(u256.from(0b10111101), 1);
    expect(res.unwrap()).toStrictEqual(2);
  });
  test('closestBit(189, 50, true)', () => {
    const res = BitMath.closestBit(u256.from(0b10111101), 50, true);
    expect(res.unwrap()).toStrictEqual(7);
  });
  test('closestBit(189, 50, false)', () => {
    const res = BitMath.closestBit(u256.from(0b10111101), 50, false);
    expect(res.isErr()).toStrictEqual(true);
  });
});
