import {
  Address,
  Context,
  Storage,
  fileToByteArray,
  createSC,
  generateEvent,
  callerHasWriteAccess,
  balance,
  transferredCoins,
} from '@massalabs/massa-as-sdk';
import { FeeParameters, LBPairInformation, Preset } from '../structs';
import {
  BinHelper,
  BASIS_POINT_MAX,
  MAX_FEE,
  MAX_PROTOCOL_SHARE,
  _sortTokens,
  SafeMath256,
  transferRemaining,
  DELIMITER,
  createKey,
} from '../libraries';
import {
  MAX_BIN_STEP,
  MIN_BIN_STEP,
  SafeMath,
  createEvent,
} from '../libraries';
import { IPair } from '../interfaces';
import { u256 } from 'as-bignum/assembly/integer/u256';
import {
  FEE_RECIPIENT,
  FLASH_LOAN_FEE,
  QUOTE_ASSETS,
  AVAILABLE_PRESETS,
  PAIR_INFORMATION,
  PRESET,
  CREATION_UNLOCKED,
  AVAILABLE_LBPAIR_BIN_STEPS,
  ALL_PAIRS,
  NEW_OWNER,
} from '../storage/Factory';
import {
  Args,
  boolToByte,
  byteToBool,
  bytesToU64,
  nativeTypeArrayToBytes,
  serializableObjectsArrayToBytes,
  stringToBytes,
  u64ToBytes,
} from '@massalabs/as-types';
import {
  LBFactory__BinStepHasNoPreset,
  LBFactory__BinStepRequirementsBreached,
  LBFactory__DecreasingPeriods,
  LBFactory__FactoryLockIsAlreadyInTheSameState,
  LBFactory__FeesAboveMax,
  LBFactory__FlashLoanFeeAboveMax,
  LBFactory__IdenticalAddresses,
  LBFactory__LBPairAlreadyExists,
  LBFactory__LBPairIgnoredIsAlreadyInTheSameState,
  LBFactory__ProtocolShareOverflows,
  LBFactory__QuoteAssetAlreadyWhitelisted,
  LBFactory__QuoteAssetNotWhitelisted,
  LBFactory__ReductionFactorOverflows,
  LBFactory__SameFeeRecipient,
  LBFactory__SameFlashLoanFee,
} from '../libraries/Errors';
import {
  CHANGE_OWNER_EVENT_NAME,
  OWNER_KEY,
  _isOwner,
  _onlyOwner,
  _setOwner,
} from '@massalabs/sc-standards/assembly/contracts/utils/ownership-internal';

// ======================================================== //
// ====                  CONSTRUCTOR                   ==== //
// ======================================================== //

/**
 * @notice Constructor
 * @param bs The serialized arguments containing:
 * - _feeRecipient The address of the fee recipient
 * - _flashLoanFee The value of the fee for flash loan
 */
export function constructor(bs: StaticArray<u8>): void {
  assert(callerHasWriteAccess(), 'constructor can only be called once');

  const args = new Args(bs);

  const _feeRecipient = args.nextString().expect('_feeRecipient is missing');
  Storage.set(FEE_RECIPIENT, _feeRecipient);

  const _flashLoanFee = args.nextU64().expect('_flashLoanFee is missing');
  assert(
    _flashLoanFee <= (MAX_FEE as u64),
    LBFactory__FlashLoanFeeAboveMax(_flashLoanFee, MAX_FEE as u64),
  );
  Storage.set(FLASH_LOAN_FEE, u64ToBytes(_flashLoanFee));

  const caller = Context.caller();
  _setOwner(caller.toString());
  Storage.set(CREATION_UNLOCKED, boolToByte(false));
  Storage.set(ALL_PAIRS, '');
  setQuoteAssets([]);
}

// ======================================================== //
// ====                     GETTERS                    ==== //
// ======================================================== //

/**
 * View function to return whether a token is a quotedAsset (true) or not (false)
 * @param _token The address of the asset
 * @returns Whether the token is a quote asset or not
 */
function isQuoteAsset(_token: Address): bool {
  let isQuoteAsset = false;

  const quoteAssets = _quoteAssets();
  for (let i = 0; i < quoteAssets.length; i++) {
    if (quoteAssets[i].equals(_token)) {
      isQuoteAsset = true;
      break;
    }
  }

  return isQuoteAsset;
}

/**
 * Returns the LBPairInformation if it exists
 */
export function getLBPairInformation(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _tokenA = new Address(args.nextString().expect('_tokenA is missing'));
  const _tokenB = new Address(args.nextString().expect('_tokenB is missing'));
  const _binStep = args.nextU32().expect('_binStep is missing');
  const tokens = _sortTokens(_tokenA, _tokenB);

  return _getLBPairInformation(
    tokens.token0,
    tokens.token1,
    _binStep,
  ).serialize();
}

/**
 * @notice Returns the LBPairInformation if it exists,
 * @dev Need to be called with token sorted
 * @param _tokenA The address of the first token of the pair
 * @param _tokenB The address of the second token of the pair
 * @param _binStep The bin step of the LBPair
 * @return The LBPairInformation
 */
function _getLBPairInformation(
  _token0: Address,
  _token1: Address,
  _binStep: u32,
): LBPairInformation {
  const key = createPairInformationKey(_token0, _token1, _binStep);
  return PAIR_INFORMATION.getSome(key, 'pair information not found');
}

/**
 * View function to return the different parameters of the preset
 */
export function getPreset(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _binStep = args.nextU32().expect('_binStep is missing');

  return _getPreset(_binStep).serialize();
}

function _getPreset(binStep: u32): Preset {
  const _preset = PRESET.getSome(binStep, 'preset not found');
  assert(binStep == _preset.binStep, 'binStep does not match');

  return _preset;
}

/*
 * View function to return the list of available binStep with a preset
 */
export function getAllBinSteps(_: StaticArray<u8>): StaticArray<u8> {
  const _nbPresets: i32 = i32(AVAILABLE_PRESETS.size());
  const presetsBinStep: u64[] = [];
  let _index = 0;
  if (_nbPresets > 0) {
    for (let i = MIN_BIN_STEP; i < MAX_BIN_STEP; i++) {
      if (AVAILABLE_PRESETS.contains(i)) {
        presetsBinStep.push(i as u64);
        if (++_index == _nbPresets) break;
      }
    }
  }
  return new Args().add(presetsBinStep).serialize();
}

/**
 * View function to return the list of available binStep for a pair of tokens
 * @param bs the serialized arguments containing:
 * - _tokenA The address of the first token of the pair
 * - _tokenB The address of the second token of the pair
 * @returns Available bin steps for a pair of tokens
 */
export function getAvailableLBPairBinSteps(
  bs: StaticArray<u8>,
): StaticArray<u8> {
  const args = new Args(bs);
  const _tokenA = new Address(args.nextString().expect('_tokenA is missing'));
  const _tokenB = new Address(args.nextString().expect('_tokenB is missing'));

  const _binSteps: u32[] = _getAvailableLBPairBinSteps(_tokenA, _tokenB);
  return nativeTypeArrayToBytes(_binSteps);
}

function _getAvailableLBPairBinSteps(
  _tokenA: Address,
  _tokenB: Address,
): u32[] {
  const tokens = _sortTokens(_tokenA, _tokenB);
  const key = createKey([tokens.token0.toString(), tokens.token1.toString()]);
  const res = AVAILABLE_LBPAIR_BIN_STEPS.get(key, []);
  if (res.length == 0) return [];
  return new Args(res).nextFixedSizeArray<u32>().unwrap();
}

/**
 * View function to return all the LBPair of a pair of tokens
 * @param {StaticArray<u8>} bs The serialized arguments
 */
export function getAllLBPairs(bs: StaticArray<u8>): StaticArray<u8> {
  const argss = new Args(bs);
  const tokenX = new Address(argss.nextString().expect('_tokenX is missing'));
  const tokenY = new Address(argss.nextString().expect('_tokenY is missing'));
  const pairs = _getAllLBPairs(tokenX, tokenY);
  return serializableObjectsArrayToBytes(pairs);
}

function _getAllLBPairs(
  _tokenX: Address,
  _tokenY: Address,
): LBPairInformation[] {
  const LBPairsAvailable: LBPairInformation[] = [];
  const tokens = _sortTokens(_tokenX, _tokenY);

  const _avLBPairBinSteps = _getAvailableLBPairBinSteps(
    tokens.token0,
    tokens.token1,
  );
  const _nbAvailable = _avLBPairBinSteps.length;

  if (_nbAvailable > 0) {
    let _index = 0;
    for (let i = MIN_BIN_STEP; i <= MAX_BIN_STEP; ++i) {
      if (_avLBPairBinSteps[_index] != i) continue;

      const _LBPairInformation = _getLBPairInformation(
        tokens.token0,
        tokens.token1,
        i,
      );
      LBPairsAvailable.push(_LBPairInformation);
      if (++_index == _nbAvailable) break;
    }
  }

  return LBPairsAvailable;
}

// ======================================================== //
// ====                     SETTERS                    ==== //
// ======================================================== //

/**
 * @dev PersistentMap from a (tokenA, tokenB, binStep) to a LBPair. The tokens are ordered to save gas, but they can be
 * in the reverse order in the actual pair. Always query one of the 2 tokens of the pair to assert the order of the 2 tokens
 */
function _setLBPairInformation(
  _tokenA: Address,
  _tokenB: Address,
  _pairInformation: LBPairInformation,
): void {
  const tokens = _sortTokens(_tokenA, _tokenB);
  const key = createPairInformationKey(
    tokens.token0,
    tokens.token1,
    _pairInformation.binStep,
  );
  PAIR_INFORMATION.set(key, _pairInformation);
}

/**
 * Set available bin steps for a pair of tokens
 */
function _setAvailableLBPairBinSteps(
  _tokenA: Address,
  _tokenB: Address,
  _binStep: u32,
): void {
  const _availableLBPairBinSteps = _getAvailableLBPairBinSteps(
    _tokenA,
    _tokenB,
  );
  _availableLBPairBinSteps.push(_binStep);
  // _availableLBPairBinSteps.sort(); // Expensive but might be necessary for getAllLBPairs
  const key = createKey([_tokenA.toString(), _tokenB.toString()]);
  const bs = new Args().add(_availableLBPairBinSteps).serialize();
  AVAILABLE_LBPAIR_BIN_STEPS.set(key, bs);
}

function _setFeeRecipient(_feeRecipient: Address): void {
  const _oldFeeRecipient = new Address(Storage.get(FEE_RECIPIENT));
  assert(
    _oldFeeRecipient.notEqual(_feeRecipient),
    LBFactory__SameFeeRecipient(_feeRecipient),
  );
  Storage.set(FEE_RECIPIENT, _feeRecipient.toString());

  const event = createEvent('NEW_FEE_RECIPIENT', [_feeRecipient.toString()]);
  generateEvent(event);
}

/**
 * Function to set the quote asset whitelisted at index `index`
 */
function setQuoteAssets(quoteAssets: Address[]): void {
  const stringifiedQuoteAssets = quoteAssets.map<string>((quoteAsset) =>
    quoteAsset.toString(),
  );
  Storage.set(QUOTE_ASSETS, stringifiedQuoteAssets.join(DELIMITER));
}

// ======================================================== //
// ====                    EXTERNAL                    ==== //
// ======================================================== //

/**
 * Create a liquidity bin LBPair for _tokenX and _tokenY
 * @param {StaticArray<u8>} bs The serialized arguments
 * -_tokenX The address of the first token
 * -_tokenY The address of the second token
 * -_activeId The id of the active bin
 * -_binStep The bin step of the LBPair
 * @returns {StaticArray<u8>} The address of the newly created LBPair
 */
export function createLBPair(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = transferredCoins();

  const caller = Context.caller();
  const args = new Args(bs);
  const _tokenA = new Address(args.nextString().expect('_tokenA is missing'));
  const _tokenB = new Address(args.nextString().expect('_tokenB is missing'));
  const _activeId = args.nextU32().expect('_activeId is missing');
  const _binStep = args.nextU32().expect('_binStep is missing');

  assert(
    byteToBool(Storage.get(CREATION_UNLOCKED)) || _isOwner(caller.toString()),
    'LBFactory__FunctionIsLockedForUsers',
  );

  assert(_tokenA.notEqual(_tokenB), LBFactory__IdenticalAddresses(_tokenA));
  assert(isQuoteAsset(_tokenB), LBFactory__QuoteAssetNotWhitelisted(_tokenB));

  // safety check, making sure that the price can be calculated
  BinHelper.getPriceFromId(_activeId, _binStep as u64);

  const tokens = _sortTokens(_tokenA, _tokenB);
  const key = createPairInformationKey(tokens.token0, tokens.token1, _binStep);
  assert(
    !PAIR_INFORMATION.contains(key),
    LBFactory__LBPairAlreadyExists(tokens.token0, tokens.token1, _binStep),
  );

  const _preset = _getPreset(_binStep);

  const _pairBytes: StaticArray<u8> = fileToByteArray('build/Pair.wasm');
  const _pair = new IPair(createSC(_pairBytes));

  // Only send the amount of coins that were not already used (amount sent - amount used)
  _pair.init(
    Context.callee(),
    _tokenA,
    _tokenB,
    _activeId,
    _preset,
    SafeMath.sub(sent, SafeMath.sub(SCBalance, balance())),
  );

  const createdByOwner = _isOwner(caller.toString());
  _setLBPairInformation(
    tokens.token0,
    tokens.token1,
    new LBPairInformation(_binStep, _pair, createdByOwner, false),
  );

  _addNewPair(_pair);

  _setAvailableLBPairBinSteps(tokens.token0, tokens.token1, _binStep);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  const event = createEvent('CREATE_LBPAIR', [
    _pair._origin.toString(),
    tokens.token0.toString(),
    tokens.token1.toString(),
    _binStep.toString(),
  ]);
  generateEvent(event);

  const eventFees = createEvent('FEE_PARAMETERS_SET', [
    caller.toString(),
    _pair._origin.toString(),
    _preset.baseFactor.toString(),
    _preset.filterPeriod.toString(),
    _preset.decayPeriod.toString(),
    _preset.reductionFactor.toString(),
    _preset.variableFeeControl.toString(),
    _preset.protocolShare.toString(),
    _preset.maxVolatilityAccumulated.toString(),
  ]);
  generateEvent(eventFees);

  return stringToBytes(_pair._origin.toString());
}

/**
 * Function to set whether the pair is ignored or not for routing, it will make the pair unusable by the quoter
 * @param {StaticArray<u8>} bs The serialized arguments
 * -_tokenA The address of the first token
 * -_tokenB The address of the second token
 * -_binStep The bin step of the LBPair
 * -_ignored: Whether to ignore (true) or not (false) the pair for routing
 */
export function setLBPairIgnored(bs: StaticArray<u8>): void {
  _onlyOwner();

  const args = new Args(bs);
  const _tokenA = new Address(args.nextString().expect('_tokenA is missing'));
  const _tokenB = new Address(args.nextString().expect('_tokenB is missing'));
  const _binStep = args.nextU32().expect('_binStep is missing');
  const _ignored = args.nextBool().expect('_ignored is missing');

  // We sort token for storage efficiency, only one input needs to be stored because they are sorted
  const tokens = _sortTokens(_tokenA, _tokenB);
  const _LBPairInformation = _getLBPairInformation(
    tokens.token0,
    tokens.token1,
    _binStep,
  );

  assert(
    _LBPairInformation.ignoredForRouting != _ignored,
    LBFactory__LBPairIgnoredIsAlreadyInTheSameState(),
  );

  _LBPairInformation.ignoredForRouting = _ignored;

  _setLBPairInformation(tokens.token0, tokens.token1, _LBPairInformation);

  const event = createEvent('SET_LBPAIR_IGNORED', [
    tokens.token0.toString(),
    tokens.token1.toString(),
    _binStep.toString(),
    _ignored.toString(),
  ]);
  generateEvent(event);
}

/**
 * Sets the preset parameters of a bin step
 * @param {StaticArray<u8>} bs The serialized arguments
 */
export function setPreset(bs: StaticArray<u8>): void {
  _onlyOwner();

  const args = new Args(bs);
  const _binStep = args.nextU32().expect('_binStep is missing');
  const _baseFactor = args.nextU32().expect('_baseFactor is missing');
  const _filterPeriod = args.nextU32().expect('_filterPeriod is missing');
  const _decayPeriod = args.nextU32().expect('_decayPeriod is missing');
  const _reductionFactor = args.nextU32().expect('_reductionFactor is missing');
  const _variableFeeControl = args
    .nextU32()
    .expect('_variableFeeControl is missing');
  const _protocolShare = args.nextU32().expect('_protocolShare is missing');
  const _maxVolatilityAccumulated = args
    .nextU32()
    .expect('_maxVolatilityAccumulated is missing');
  const _sampleLifetime = args.nextU32().expect('_sampleLifetime is missing');

  _checkFeeParameters(
    _binStep,
    _baseFactor,
    _filterPeriod,
    _decayPeriod,
    _reductionFactor,
    _variableFeeControl,
    _protocolShare,
    _maxVolatilityAccumulated,
  );

  const _preset = new Preset(
    _binStep,
    _baseFactor,
    _filterPeriod,
    _decayPeriod,
    _reductionFactor,
    _variableFeeControl,
    _protocolShare,
    _maxVolatilityAccumulated,
    _sampleLifetime,
  );
  PRESET.set(_binStep, _preset);
  AVAILABLE_PRESETS.set(_binStep, '1');

  const event = createEvent('SET_PRESET', [
    _binStep.toString(),
    _baseFactor.toString(),
    _filterPeriod.toString(),
    _decayPeriod.toString(),
    _reductionFactor.toString(),
    _variableFeeControl.toString(),
    _protocolShare.toString(),
    _maxVolatilityAccumulated.toString(),
    _sampleLifetime.toString(),
  ]);
  generateEvent(event);
}

/**
 * Remove the preset linked to a binStep
 * @param {StaticArray<u8>} bs The serialized arguments
 */
export function removePreset(bs: StaticArray<u8>): void {
  _onlyOwner();

  const args = new Args(bs);
  const _binStep = args.nextU32().expect('_binStep is missing');
  assert(
    AVAILABLE_PRESETS.contains(_binStep),
    LBFactory__BinStepHasNoPreset(_binStep),
  );
  PRESET.delete(_binStep);

  AVAILABLE_PRESETS.delete(_binStep);

  const event = createEvent('DELETE_AVAILABLE_PRESETS', [_binStep.toString()]);
  generateEvent(event);
}

/**
 * Function to set the fee parameter of a LBPair
 * @param {StaticArray<u8>} bs The serialized arguments
 */
export function setFeesParametersOnPair(bs: StaticArray<u8>): void {
  _onlyOwner();

  const args = new Args(bs);
  const _tokenA = new Address(args.nextString().expect('_tokenA is missing'));
  const _tokenB = new Address(args.nextString().expect('_tokenB is missing'));
  const _binStep = args.nextU32().expect('_binStep is missing');
  const _baseFactor = args.nextU32().expect('_baseFactor is missing');
  const _filterPeriod = args.nextU32().expect('_filterPeriod is missing');
  const _decayPeriod = args.nextU32().expect('_decayPeriod is missing');
  const _reductionFactor = args.nextU32().expect('_reductionFactor is missing');
  const _variableFeeControl = args
    .nextU32()
    .expect('_variableFeeControl is missing');
  const _protocolShare = args.nextU32().expect('_protocolShare is missing');
  const _maxVolatilityAccumulated = args
    .nextU32()
    .expect('_maxVolatilityAccumulated is missing');

  const tokens = _sortTokens(_tokenA, _tokenB);
  const _LBPair = _getLBPairInformation(
    tokens.token0,
    tokens.token1,
    _binStep,
  ).pair;

  _checkFeeParameters(
    _binStep,
    _baseFactor,
    _filterPeriod,
    _decayPeriod,
    _reductionFactor,
    _variableFeeControl,
    _protocolShare,
    _maxVolatilityAccumulated,
  );
  const preset = new FeeParameters(
    _binStep,
    _baseFactor,
    _filterPeriod,
    _decayPeriod,
    _reductionFactor,
    _variableFeeControl,
    _protocolShare,
    _maxVolatilityAccumulated,
  );
  _LBPair.setFeesParameters(preset);

  const event = createEvent('NEW_FEES_PARAMETERS', [
    _binStep.toString(),
    _baseFactor.toString(),
    _filterPeriod.toString(),
    _decayPeriod.toString(),
    _reductionFactor.toString(),
    _variableFeeControl.toString(),
    _protocolShare.toString(),
    _maxVolatilityAccumulated.toString(),
  ]);
  generateEvent(event);
}

/**
 * Function to set the recipient of the fees. This address needs to be able to receive ERC20s
 * @param {StaticArray<u8>} bs The serialized arguments
 */
export function setFeeRecipient(bs: StaticArray<u8>): void {
  _onlyOwner();

  const _feeRecipient = new Address(
    new Args(bs).nextString().expect('_feeRecipient is missing'),
  );
  _setFeeRecipient(_feeRecipient);
}

/**
 * Function to set the flash loan fee
 * @param {StaticArray<u8>} bs The serialized arguments
 */
export function setFlashLoanFee(bs: StaticArray<u8>): void {
  _onlyOwner();

  const _flashLoanFee = new Args(bs)
    .nextU64()
    .expect('_flashLoanFee is missing');
  const _oldFlashLoanFee = bytesToU64(Storage.get(FLASH_LOAN_FEE));
  assert(
    _oldFlashLoanFee != _flashLoanFee,
    LBFactory__SameFlashLoanFee(_flashLoanFee),
  );
  assert(
    _flashLoanFee <= (MAX_FEE as u64),
    LBFactory__FlashLoanFeeAboveMax(_flashLoanFee, MAX_FEE as u64),
  );
  Storage.set(FLASH_LOAN_FEE, u64ToBytes(_flashLoanFee));

  const event = createEvent('NEW_FLASH_LOAN_FEE', [_flashLoanFee.toString()]);
  generateEvent(event);
}

/**
 * Function to set the creation restriction of the Factory
 * @param {StaticArray<u8>} bs The serialized arguments
 */
export function setFactoryLockedState(bs: StaticArray<u8>): void {
  _onlyOwner();

  const _locked = new Args(bs).nextBool().expect('_locked is missing');
  const _creation_unlocked = byteToBool(Storage.get(CREATION_UNLOCKED));
  assert(
    _creation_unlocked == _locked,
    LBFactory__FactoryLockIsAlreadyInTheSameState(),
  );
  Storage.set(CREATION_UNLOCKED, boolToByte(!_locked));

  const event = createEvent('CREATION_UNLOCKED', [(!_locked).toString()]);
  generateEvent(event);
}

/**
 * Function to add an asset to the whitelist of quote assets
 * @param {StaticArray<u8>} bs The serialized arguments
 */
export function addQuoteAsset(bs: StaticArray<u8>): void {
  _onlyOwner();

  const _quoteAsset = new Address(
    new Args(bs).nextString().expect('_quoteAsset is missing'),
  );
  const quoteAssets = _quoteAssets();
  assert(
    !isQuoteAsset(_quoteAsset),
    LBFactory__QuoteAssetAlreadyWhitelisted(_quoteAsset),
  );
  quoteAssets.push(_quoteAsset);
  setQuoteAssets(quoteAssets);

  const event = createEvent('ADD_QUOTE_ASSET', [_quoteAsset.toString()]);
  generateEvent(event);
}

/**
 * Function to remove an asset from the whitelist of quote assets
 * @param {StaticArray<u8>} bs The serialized arguments
 */
export function removeQuoteAsset(bs: StaticArray<u8>): void {
  _onlyOwner();

  const _quoteAsset = new Address(
    new Args(bs).nextString().expect('_quoteAsset is missing'),
  );
  assert(
    isQuoteAsset(_quoteAsset),
    LBFactory__QuoteAssetNotWhitelisted(_quoteAsset),
  );
  const quoteAssets = _quoteAssets().filter((_quoteAsset) =>
    _quoteAsset.notEqual(_quoteAsset),
  );
  setQuoteAssets(quoteAssets);

  const event = createEvent('REMOVE_QUOTE_ASSET', [_quoteAsset.toString()]);
  generateEvent(event);
}

export function forceDecay(bs: StaticArray<u8>): void {
  _onlyOwner();

  const pair = new IPair(
    new Address(new Args(bs).nextString().expect('pair is missing')),
  );
  pair.forceDecay();
}

/**
 * Propose to transfer the ownership of the contract to a new account (`newOwner`).
 * @param {StaticArray<u8>} bs The serialized arguments containing the new owner address
 */
export function proposeNewOwner(bs: StaticArray<u8>): void {
  _onlyOwner();

  const _newOwner = new Address(
    new Args(bs).nextString().expect('_newOwner is missing'),
  );
  Storage.set(NEW_OWNER, _newOwner.toString());

  const event = createEvent('NEW_OWNER_PROPOSED', [_newOwner.toString()]);
  generateEvent(event);
}

/**
 * Accept the ownership of the contract.
 * @param {StaticArray<u8>} _ - unused
 */
export function acceptOwnership(_: StaticArray<u8>): void {
  assert(Storage.has(NEW_OWNER), 'no owner proposed');
  const _newOwner = new Address(Storage.get(NEW_OWNER));

  assert(Context.caller().equals(_newOwner), 'caller is not the new owner');
  Storage.del(NEW_OWNER);

  _setFeeRecipient(_newOwner);
  Storage.set(OWNER_KEY, _newOwner.toString());

  const event = createEvent(CHANGE_OWNER_EVENT_NAME, [_newOwner.toString()]);
  generateEvent(event);
}

// ======================================================== //
// ====                     HELPERS                    ==== //
// ======================================================== //

function _addNewPair(_pair: IPair): void {
  const pairs = Storage.has(ALL_PAIRS)
    ? Storage.get(ALL_PAIRS).split(DELIMITER)
    : [];
  pairs.push(_pair._origin.toString());
  Storage.set(ALL_PAIRS, pairs.join(DELIMITER));
}

/**
 * Internal function to check the fee parameter of a LBPair
 * @param _binStep The bin step in basis point, used to calculate log(1 + binStep)
 * @param _baseFactor The base factor, used to calculate the base fee, baseFee = baseFactor * binStep
 * @param _filterPeriod The period where the accumulator value is untouched, prevent spam
 * @param _decayPeriod The period where the accumulator value is halved
 * @param _reductionFactor The reduction factor, used to calculate the reduction of the accumulator
 * @param _variableFeeControl The variable fee control, used to control the variable fee, can be 0 to disable it
 * @param _protocolShare The share of the fees received by the protocol
 * @param _maxVolatilityAccumulated The max value of volatility accumulated
 */
function _checkFeeParameters(
  _binStep: u32,
  _baseFactor: u32,
  _filterPeriod: u32,
  _decayPeriod: u32,
  _reductionFactor: u32,
  _variableFeeControl: u32,
  _protocolShare: u32,
  _maxVolatilityAccumulated: u32,
): void {
  assert(
    (MIN_BIN_STEP as u32) <= _binStep && _binStep <= (MAX_BIN_STEP as u32),
    LBFactory__BinStepRequirementsBreached(
      MIN_BIN_STEP,
      _binStep,
      MAX_BIN_STEP,
    ),
  );
  assert(
    _filterPeriod < _decayPeriod,
    LBFactory__DecreasingPeriods(_filterPeriod, _decayPeriod),
  );
  assert(
    _reductionFactor <= (BASIS_POINT_MAX as u32),
    LBFactory__ReductionFactorOverflows(_reductionFactor, BASIS_POINT_MAX),
  );
  assert(
    _protocolShare <= (MAX_PROTOCOL_SHARE as u32),
    LBFactory__ProtocolShareOverflows(_protocolShare, MAX_PROTOCOL_SHARE),
  );

  const _baseFee = SafeMath256.mul(
    u256.from(SafeMath.mul(_baseFactor, _binStep)),
    u256.from(u64(1e10)),
  );

  // Can't overflow as the max value is `max(u32) * (max(u32) * max(u32)) ** 2 < max(u256)`
  // It returns 18 decimals as:
  // decimals(variableFeeControl * (volatilityAccumulated * binStep)**2 / 100) = 4 + (4 + 4) * 2 - 2 = 18
  let _prod = SafeMath256.mul(
    u256.from(_maxVolatilityAccumulated),
    u256.from(_binStep),
  );
  _prod = SafeMath256.mul(_prod, _prod);
  const _maxVariableFee = u256.div(
    SafeMath256.mul(_prod, u256.from(_variableFeeControl)),
    u256.from(100),
  );
  assert(
    u256.add(_baseFee, _maxVariableFee) <= u256.from(MAX_FEE),
    LBFactory__FeesAboveMax(_baseFee.toU64(), _maxVariableFee.toU64(), MAX_FEE),
  );
}

function _quoteAssets(): Address[] {
  const stringifiedQuoteAssets = Storage.get(QUOTE_ASSETS).split(DELIMITER);
  const res: Address[] = [];
  for (let i = 0; i < stringifiedQuoteAssets.length; i++) {
    res.push(new Address(stringifiedQuoteAssets[i]));
  }
  return res;
}

function createPairInformationKey(
  tokenA: Address,
  tokenB: Address,
  binStep: u32,
): string {
  return createKey([tokenA.toString(), tokenB.toString(), binStep.toString()]);
}

/**
 * @notice Function used by an SC to receive Massa coins
 * @param _ unused
 */
export function receiveCoins(_: StaticArray<u8>): void {}
