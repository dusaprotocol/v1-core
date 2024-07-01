import { stringToBytes } from '@massalabs/as-types';
import { PersistentMap } from '../libraries/PersistentMap';
import { Preset, LBPairInformation } from '../structs';

export const FEE_RECIPIENT = 'FEE_RECIPIENT';
export const FLASH_LOAN_FEE = stringToBytes('FLASH_LOAN_FEE');

export const QUOTE_ASSETS = 'QUOTE_ASSETS';

export const NEW_OWNER = 'NEW_OWNER';
export const ALL_PAIRS = 'ALL_PAIRS';

/// @notice Whether the createLBPair function is unlocked and can be called by anyone (true) or only by owner (false)
export const CREATION_UNLOCKED = stringToBytes('CREATION_UNLOCKED');

/// @dev PersitentMap from a (tokenA, tokenB, binStep) to LBPairInformation. The tokens are ordered to save gas, but they can be
/// in the reverse order in the actual pair. Always query one of the 2 tokens of the pair to assert the order of the 2 tokens
export const PAIR_INFORMATION = new PersistentMap<string, LBPairInformation>(
  'PAIR_INFORMATION',
);
/// The parameters presets
export const PRESET = new PersistentMap<u32, Preset>('PRESET');
/// @dev Whether a preset was set or not, if the bit at `index` is 1, it means that the binStep `index` was set
/// The max binStep set is 247. We use this method instead of an array to keep it ordered and to reduce gas
export const AVAILABLE_PRESETS = new PersistentMap<u32, string>(
  'AVAILABLE_PRESETS',
);

/// @dev Whether a LBPair was created with a bin step, if the bit at `index` is 1, it means that the LBPair with binStep `index` exists
/// The max binStep set is 247. We use this method instead of an array to keep it ordered and to reduce gas
/// Key is a combination of the two tokens addresses
/// remplaced by a arrayof u32 containing each bin step for now
export const AVAILABLE_LBPAIR_BIN_STEPS = new PersistentMap<
  string,
  StaticArray<u8>
>('AVAILABLE_LBPAIR_BIN_STEPS');
