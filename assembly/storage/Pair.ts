import { stringToBytes } from '@massalabs/as-types';
import { PersistentMap } from '../libraries/PersistentMap';
import { Bin, Debt, Oracle } from '../structs';
import { u256 } from 'as-bignum/assembly/integer/u256';

export const FACTORY = 'FACTORY';
/// @notice The token that is used as the base currency for the pair
export const TOKEN_X = 'TOKEN_X';
/// @notice The token that is used as the quote currency for the pair
export const TOKEN_Y = 'TOKEN_Y';

/// @dev The pair information that is used to track reserves, active ids,
/// fees and oracle parameters
export const PAIR_INFORMATION = stringToBytes('PAIR_INFORMATION');
/// @dev The fee parameters that are used to calculate fees
export const FEES_PARAMETERS = stringToBytes('FEES_PARAMETERS');
/// @dev Reentrancy Guard status
export const STATUS = stringToBytes('status');

/// @dev PersistentMap from id to Bin.
/// This is the amount of tokenY if `id < _pairInformation.activeId`;
/// of tokenX if `id > _pairInformation.activeId` and a mix of both if `id == _pairInformation.activeId`
export const BINS = new PersistentMap<u32, Bin>('bin');
/// @dev PersistentMap from account to user's unclaimed fees
export const UNCLAIMED_FEES = new PersistentMap<string, StaticArray<u8>>(
  'unclaimed_fees',
);
/// @dev PersistentMap from account to id to user's accruedDebt
export const ACCRUED_DEBTS = new PersistentMap<string, Debt>('accrued_debts');
/// @dev PersistentMap from account to id to user's bins
export const DEPOSITED_BINS = new PersistentMap<string, StaticArray<u8>>(
  'deposited_bins',
);
/// @dev The oracle samples that are used to calculate the time weighted average data
export const ORACLE = new Oracle('oracle');

/// @dev PersistentMap from account to spender approvals
// Key is a combination of owner and spender addresses
export const SPENDER_APPROVALS = new PersistentMap<string, bool>(
  'spender_approvals',
);

/// @dev PersistentMap from token ID to account balances
// Key is a combination of token ID and account address
export const BALANCES = new PersistentMap<string, u256>('balances');

/// @dev PersistentMap from token ID to total supplies
export const TOTAL_SUPPLIES = new PersistentMap<u64, u256>('total_supplies');

/// @dev The tree that is used to find the first bin with non zero liquidity
export const TREE = new PersistentMap<string, u256>('tree');
