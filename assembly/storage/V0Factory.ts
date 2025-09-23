import { stringToBytes } from '@massalabs/as-types/assembly/serialization/strings';
import { PersistentMap } from '../libraries/PersistentMap';

export const FEE_TO_KEY = 'feeTo';
export const FEE_TO_SETTER_KEY = 'feeToSetter';
export const ALL_PAIRS_KEY = stringToBytes('allPairs');
export const PAIRS = new PersistentMap<string, string>('pairMapping');
