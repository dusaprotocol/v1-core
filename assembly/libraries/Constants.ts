import { Address } from '@massalabs/massa-as-sdk/assembly/std/address';
import { u128 } from 'as-bignum/assembly/integer/u128';
import { u256 } from 'as-bignum/assembly/integer/u256';

export const REAL_ID_SHIFT: i64 = 1 << 23;
export const ID_ONE: u32 = 2 ** 23;
export const BASIS_POINT_MAX: u16 = 10_000;
export const PRECISION: u256 = u256.from(u64(10 ** 18));
export const ONE_COIN: u64 = 10 ** 9;
export const SCALE_OFFSET = 128;
export const MIN_BIN_STEP = 1;
export const MAX_BIN_STEP = 100;
export const MAX_FEE: u64 = 10 ** 17; // 10%
export const ONE = u256.One;
export const ZERO = u256.Zero;
export const MAX = u256.Max;
export const TWO = u256.fromU64(2);
export const THREE = u256.fromU64(3);
export const ZERO_ADDRESS = new Address('');
export const MAX_U128 = u256.from(u128.Max);
