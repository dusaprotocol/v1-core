import { stringToBytes } from '@massalabs/as-types/assembly/serialization/strings';
import { u128 } from 'as-bignum/assembly/integer/u128';
import { u256 } from 'as-bignum/assembly/integer/u256';

export const MINIMUM_LIQUIDITY = u256.from(10 ** 3);
export const maxReserve = u256.from(u128.Max);

export const FACTORY = 'factory';
export const TOKEN_0 = 'token0';
export const TOKEN_1 = 'token1';

export const RESERVE_0 = stringToBytes('reserve0');
export const RESERVE_1 = stringToBytes('reserve1');
export const blockTimestampLast = stringToBytes('blockTimestampLast');

export const price0CumulativeLast = stringToBytes('price0CumulativeLast');
export const price1CumulativeLast = stringToBytes('price1CumulativeLast');
export const kLast = stringToBytes('kLast'); // reserve0 * reserve1, as of immediately after the most recent liquidity event

export const STATUS = stringToBytes('STATUS');
