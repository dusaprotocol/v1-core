import { Result } from '@massalabs/as-types';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { SafeMathU8 } from './SafeMath';

/// @notice Helper contract used for bit calculations
export class BitMath {
  /**
   * Returns the closest non-zero bit of `integer` to the right (of left) of the `bit` bits that is not `bit`
   * @param _integer The integer as a u256
   * @param _bit The bit index
   * @param _rightSide Whether we're searching in the right side of the tree (true) or the left side (false)
   * @return The index of the closest non-zero bit.
   */
  static closestBit(_integer: u256, _bit: u8, _rightSide: bool): Result<u8> {
    return _rightSide
      ? this.closestBitRight(_integer, i32(SafeMathU8.sub(_bit, 1)))
      : this.closestBitLeft(_integer, i32(SafeMathU8.add(_bit, 1)));
  }

  /**
   * Returns the index of the closest bit on the right of x that is non null
   * @param x The value as a u256
   * @param bit The index of the bit to start searching at
   * @return The index of the closest non null bit on the right of x.
   */
  static closestBitRight(x: u256, bit: i32): Result<u8> {
    const _shift = 255 - bit;
    x = u256.shl(x, _shift); // x = x * 2 ** _shift

    // can't overflow as it's non-zero and we shifted it by `_shift`
    return x.isZero()
      ? new Result(u8(0), 'BitMath: no closest bit right')
      : new Result(this.mostSignificantBit(x) - u8(_shift));
  }

  /** Returns the index of the closest bit on the left of x that is non null
   * @param x The value as a u256
   * @param bit The index of the bit to start searching at
   * @return The index of the closest non null bit on the left of x.
   */
  static closestBitLeft(x: u256, bit: i32): Result<u8> {
    assert(bit < 256, 'BitMath: bit out of range');
    x = u256.shr(x, bit); // x = x / 2 ** bit

    return x.isZero()
      ? new Result(u8(0), 'BitMath: no closest bit left')
      : new Result(this.leastSignificantBit(x) + u8(bit));
  }

  /** Returns the index of the most significant bit of x
   * @param x The value as a u256
   * @return The index of the most significant bit of x
   */
  static mostSignificantBit(x: u256): u8 {
    let msb: u8 = 0;

    if (x >= u256.shl(u256.One, 128)) {
      x = u256.shr(x, 128);
      msb += 128;
    }
    if (x >= u256.shl(u256.One, 64)) {
      x = u256.shr(x, 64);
      msb += 64;
    }
    if (x >= u256.shl(u256.One, 32)) {
      x = u256.shr(x, 32);
      msb += 32;
    }
    if (x >= u256.shl(u256.One, 16)) {
      x = u256.shr(x, 16);
      msb += 16;
    }
    if (x >= u256.shl(u256.One, 8)) {
      x = u256.shr(x, 8);
      msb += 8;
    }
    if (x >= u256.shl(u256.One, 4)) {
      x = u256.shr(x, 4);
      msb += 4;
    }
    if (x >= u256.shl(u256.One, 2)) {
      x = u256.shr(x, 2);
      msb += 2;
    }
    if (x >= u256.shl(u256.One, 1)) {
      msb += 1;
    }

    return msb;
  }

  /** Returns the index of the least significant bit of x
   * @param x The value as a u256
   * @return The index of the least significant bit of x
   */
  static leastSignificantBit(x: u256): u8 {
    let lsb: u8 = 0;

    if (!u256.shl(x, 128).isZero()) {
      x = u256.shl(x, 128);
      lsb += 128;
    }
    if (!u256.shl(x, 64).isZero()) {
      x = u256.shl(x, 64);
      lsb += 64;
    }
    if (!u256.shl(x, 32).isZero()) {
      x = u256.shl(x, 32);
      lsb += 32;
    }
    if (!u256.shl(x, 16).isZero()) {
      x = u256.shl(x, 16);
      lsb += 16;
    }
    if (!u256.shl(x, 8).isZero()) {
      x = u256.shl(x, 8);
      lsb += 8;
    }
    if (!u256.shl(x, 4).isZero()) {
      x = u256.shl(x, 4);
      lsb += 4;
    }
    if (!u256.shl(x, 2).isZero()) {
      x = u256.shl(x, 2);
      lsb += 2;
    }
    if (!u256.shl(x, 1).isZero()) {
      lsb += 1;
    }

    return 255 - lsb;
  }

  /** Returns the most (or least) significant bit of `_integer`
   * @param _integer The integer
   * @param _isMostSignificant Whether we want the most (true) or the least (false) significant bit
   * @return The index of the most (or least) significant bit
   */
  static significantBit(_integer: u256, _isMostSignificant: bool): u8 {
    return _isMostSignificant
      ? this.mostSignificantBit(_integer)
      : this.leastSignificantBit(_integer);
  }
}