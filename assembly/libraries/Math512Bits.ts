import { u256 } from 'as-bignum/assembly/integer/u256';
import {
  Math512Bits__MulDivOverflow,
  Math512Bits__MulShiftOverflow,
  Math512Bits__OffsetOverflows,
} from './Errors';
import { GetMulProds } from '../structs/Returns';

// Helper contract used for full precision calculations
export class Math512Bits {
  /**
   * Calculates floor(x*y÷denominator) with full precision
   * The result will be rounded down
   *
   * Credit to Remco Bloemen under MIT license https://xn--2-umb.com/21/muldiv
   *
   * Requirements:
   * - The denominator cannot be zero
   * - The result must fit within u256
   *
   * Caveats:
   * - This function does not work with fixed-point numbers
   *
   * @param x The multiplicand as an u256
   * @param y The multiplier as an u256
   * @param denominator The divisor as an u256
   * @returns The result as an u256
   */
  static mulDivRoundDown(x: u256, y: u256, denominator: u256): u256 {
    const r = _getMulProds(x, y);

    return _getEndOfDivRoundDown(x, y, denominator, r.prod0, r.prod1);
  }

  /**
   * Calculates x << offset / y with full precision
   * The result will be rounded down
   *
   * Credit to Remco Bloemen under MIT license https://xn--2-umb.com/21/muldiv
   *
   * Requirements:
   * - The offset needs to be strictly lower than 256
   * - The result must fit within u256
   *
   * Caveats:
   * - This function does not work with fixed-point numbers
   *
   * @param x The multiplicand as an u256
   * @param offset The number of bit to shift x
   * @param denominator The divisor as an u256
   * @returns The result as an u256
   */
  static shiftDivRoundDown(x: u256, offset: i32, denominator: u256): u256 {
    assert(offset <= 255, Math512Bits__OffsetOverflows(offset));

    const prod0 = u256.shl(x, offset); // Least significant 64 bits of the product
    const prod1 = u256.shr(x, 256 - offset); // Most significant 64 bits of the product

    return _getEndOfDivRoundDown(
      x,
      u256.shl(u256.One, offset),
      denominator,
      prod0,
      prod1,
    );
  }

  /**
   * Calculates x * y >> offset with full precision
   * The result will be rounded down
   *
   * Credit to Remco Bloemen under MIT license https://xn--2-umb.com/21/muldiv
   *
   * Requirements:
   * - The offset needs to be strictly lower than 256
   * - The result must fit within u256
   *
   * Caveats:
   * - This function does not work with fixed-point numbers
   *
   * @param x The multiplicand as an u256
   * @param y The multiplier as an u256
   * @param offset The offset, can't be greater than 255
   * @returns The result as an u256
   */
  static mulShiftRoundDown(x: u256, y: u256, offset: i32): u256 {
    assert(offset <= 255, Math512Bits__OffsetOverflows(offset));

    let result = u256.Zero;
    const r = _getMulProds(x, y);

    if (r.prod0 != u256.Zero) result = u256.shr(r.prod0, offset as i32);
    if (r.prod1 != u256.Zero) {
      // Make sure the result is less than 2^256.
      assert(
        r.prod1 < u256.shl(u256.One, offset),
        Math512Bits__MulShiftOverflow(r.prod1, offset),
      );

      // unsafe math is fine
      result = u256.add(result, u256.shl(r.prod1, (256 - offset) as i32));
    }
    return result;
  }

  /**
   * Calculates x << offset / y with full precision
   * The result will be rounded up
   *
   * Credit to Remco Bloemen under MIT license https://xn--2-umb.com/21/muldiv
   *
   * Requirements:
   * - The offset needs to be strictly lower than 128
   * - The result must fit within u256
   *
   * Caveats:
   * - This function does not work with fixed-point numbers
   *
   * @param x The multiplicand as an u256
   * @param offset The number of bit to shift x
   * @param denominator The divisor as an u256
   * @returns The result as an u256
   */
  static shiftDivRoundUp(x: u256, offset: i32, denominator: u256): u256 {
    let result = this.shiftDivRoundDown(x, offset, denominator);
    if (mulmod(x, u256.shl(u256.One, offset), denominator) != u256.Zero)
      // unsafe math is fine
      result = u256.add(result, u256.One);
    return result;
  }

  /**
   * Calculates x * y >> offset with full precision
   * The result will be rounded up
   *
   * Credit to Remco Bloemen under MIT license https://xn--2-umb.com/21/muldiv
   *
   * Requirements:
   * - The offset needs to be strictly lower than 128
   * - The result must fit within u256
   *
   * Caveats:
   * - This function does not work with fixed-point numbers
   *
   * @param x The multiplicand as an u256
   * @param y The multiplier as an u256
   * @param offset The offset, can't be greater than 128
   * @returns The result as an u256
   */
  static mulShiftRoundUp(x: u256, y: u256, offset: i32): u256 {
    let result = this.mulShiftRoundDown(x, y, offset);
    if (mulmod(x, y, u256.shl(u256.One, offset)) != u256.Zero)
      // unsafe math is fine
      result = u256.add(result, u256.One);
    return result;
  }
}

/**
 * Helper function to return the result of `x * y / denominator` with full precision
 * @param x The multiplicand as an u256
 * @param y The multiplier as an u256
 * @param denominator The divisor as an u256
 * @param prod0 The least significant 256 bits of the product
 * @param prod1 The most significant 256 bits of the product
 * @returns
 */
function _getEndOfDivRoundDown(
  x: u256,
  y: u256,
  denominator: u256,
  prod0: u256,
  prod1: u256,
): u256 {
  // Handle non-overflow cases, 256 by 256 division
  if (prod1 == u256.Zero) {
    return u256.div(prod0, denominator); // unsafe math is fine
  } else {
    // Make sure the result is less than 2^256. Also prevents denominator == 0
    assert(
      prod1 < denominator,
      Math512Bits__MulDivOverflow(prod1, denominator),
    );

    // Make division exact by subtracting the remainder from [prod1 prod0].
    let remainder: u256 = u256.Zero;
    // Compute remainder using mulmod.
    remainder = mulmod(x, y, denominator);

    // Subtract 256 bit number from 512 bit number.
    // unsafe math is fine
    prod1 = u256.sub(prod1, gt(remainder, prod0));
    prod0 = u256.sub(prod0, remainder);

    // Factor powers of two out of denominator and compute largest power of two divisor of denominator. Always >= 1
    // See https://cs.stackexchange.com/q/138556/92363
    {
      // Does not overflow because the denominator cannot be zero at this stage in the function
      let lpotdod = u256.and(
        denominator,
        u256.add(denominator.not(), u256.One),
      );
      // Divide denominator by lpotdod.
      denominator = u256.div(denominator, lpotdod);

      // Divide [prod1 prod0] by lpotdod.
      prod0 = u256.div(prod0, lpotdod);

      // Flip lpotdod such that it is 2^64 / lpotdod. If lpotdod is zero, then it becomes one
      lpotdod = u256.add(
        u256.div(u256.sub(u256.Zero, lpotdod), lpotdod),
        u256.One,
      );

      // Shift in bits from prod1 into prod0
      prod0 = u256.or(prod0, u256.mul(prod1, lpotdod));

      // Invert denominator mod 2^64. Now that denominator is an odd number, it has an inverse modulo 2^64 such
      // that denominator * inv = 1 mod 2^64. Compute the inverse by starting with a seed that is correct for
      // four bits. That is, denominator * inv = 1 mod 2^4
      let inter: u256 = u256.mul(u256.fromU64(3), denominator);
      let inverse: u256 = u256.mul(inter, inter);

      // Use the Newton-Raphson iteration to improve the precision. Thanks to Hensel's lifting lemma, this also works
      // in modular arithmetic, doubling the correct bits in each step
      inverse = u256.mul(
        inverse,
        u256.sub(u256.fromU64(2), u256.mul(denominator, inverse)),
      ); // inverse mod 2^8
      inverse = u256.mul(
        inverse,
        u256.sub(u256.fromU64(2), u256.mul(denominator, inverse)),
      ); // inverse mod 2^16
      inverse = u256.mul(
        inverse,
        u256.sub(u256.fromU64(2), u256.mul(denominator, inverse)),
      ); // inverse mod 2^32
      inverse = u256.mul(
        inverse,
        u256.sub(u256.fromU64(2), u256.mul(denominator, inverse)),
      ); // inverse mod 2^64
      inverse = u256.mul(
        inverse,
        u256.sub(u256.fromU64(2), u256.mul(denominator, inverse)),
      ); // inverse mod 2^128
      inverse = u256.mul(
        inverse,
        u256.sub(u256.fromU64(2), u256.mul(denominator, inverse)),
      ); // inverse mod 2^256

      // Because the division is now exact we can divide by multiplying with the modular inverse of denominator.
      // This will give us the correct result modulo 2^64. Since the preconditions guarantee that the outcome is
      // less than 2^64, this is the final result. We don't need to compute the high bits of the result and prod1
      // is no longer required.
      return u256.mul(prod0, inverse);
    }
  }
}

function _getMulProds(x: u256, y: u256): GetMulProds {
  // 512-bit multiply [prod1 prod0] = x * y. Compute the product mod 2^256 and mod 2^256 - 1, then use
  // use the Chinese Remainder Theorem to reconstruct the 512 bit result. The result is stored in two 256
  // variables such that product = prod1 * 2^256 + prod0.
  const mm = mulmod(x, y, u256.Max);
  const prod0 = u256.mul(x, y);
  const prod1 = u256.sub(u256.sub(mm, prod0), lt(mm, prod0));
  return new GetMulProds(prod0, prod1);
}

// ======================================================== //
// ====             YUL (SOLIDITY ASSEMBLY)            ==== //
// ======================================================== //

function mulmod(x: u256, y: u256, k: u256): u256 {
  // TODO: precision currenly insufficient
  assert(k != u256.Zero, 'k must be non-zero');
  return u256.rem(u256.mul(x, y), k);
}

function lt(x: u256, y: u256): u256 {
  return x < y ? u256.One : u256.Zero;
}

function gt(x: u256, y: u256): u256 {
  return x > y ? u256.One : u256.Zero;
}
