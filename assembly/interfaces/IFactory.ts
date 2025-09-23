import {
  Args,
  bytesToNativeTypeArray,
  bytesToString,
  NoArg,
} from '@massalabs/as-types';
import { Address, call, Storage } from '@massalabs/massa-as-sdk';
import { LBPairInformation } from '../structs/LBPairInformation';
import {
  HooksParameters,
  MAX_BIN_STEP,
  MIN_BIN_STEP,
  ZERO,
  _sortTokens,
} from '../libraries';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { Preset } from '../structs/Preset';
import { OWNER_KEY } from '@massalabs/sc-standards/assembly/contracts/utils/ownership-internal';

export class IFactory {
  _origin: Address;

  /**
   * Wraps a smart contract exposing standard token FFI.
   *
   * @param {Address} at - Address of the smart contract.
   */
  constructor(at: Address) {
    this._origin = at;
  }

  /**
   * Initialize the factory. This function must be called before any other function.
   *
   * @param {Address} _feeRecipient - The address of the fee recipient
   * @param {u64} _flashLoanFee - The value of the fee for flash loan
   */
  init(
    _feeRecipient: Address,
    _quoteAssets: Address[],
    _flashLoanFee: u256 = ZERO,
  ): void {
    const args = new Args()
      .add(_feeRecipient)
      .addSerializableObjectArray(_quoteAssets)
      .add(_flashLoanFee);
    call(this._origin, 'constructor', args, 0);
  }

  getLBPairInformation(
    _tokenA: Address,
    _tokenB: Address,
    _binStep: u64,
  ): LBPairInformation {
    const args = new Args().add(_tokenA).add(_tokenB).add(_binStep);
    const res = call(this._origin, 'getLBPairInformation', args, 0);
    return new Args(res).nextSerializable<LBPairInformation>().unwrap();
  }

  getAllLBPairs(_tokenX: Address, _tokenY: Address): LBPairInformation[] {
    const LBPairsAvailable: LBPairInformation[] = [];
    const tokens = _sortTokens(_tokenX, _tokenY);

    const _avLBPairBinSteps = this.getAvailableLBPairBinSteps(
      tokens.token0,
      tokens.token1,
    );
    const _nbAvailable = _avLBPairBinSteps.length;

    if (_nbAvailable > 0) {
      let _index = 0;
      let _LBPairInformation: LBPairInformation;

      for (let i = MIN_BIN_STEP; i <= MAX_BIN_STEP; ++i) {
        if (_avLBPairBinSteps[_index] != i) continue;

        _LBPairInformation = this.getLBPairInformation(
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

  /**
   * @dev Create a new LBPair
   * @param _tokenA address of the first token
   * @param _tokenB address of the second token
   * @param _activeId active id disired
   * @param _binStep bin step disired
   * @param _masToSend Massa to send for storage
   * @returns the address of the new LBPair
   */
  createLBPair(
    _tokenA: Address,
    _tokenB: Address,
    _activeId: u32,
    _binStep: u32,
    _masToSend: u64,
  ): Address {
    const args = new Args()
      .add(_tokenA)
      .add(_tokenB)
      .add(_activeId)
      .add(_binStep);
    const res = call(this._origin, 'createLBPair', args, _masToSend);
    return new Address(bytesToString(res));
  }

  setLBPairIgnored(
    _tokenA: Address,
    _tokenB: Address,
    _binStep: u32,
    _ignored: bool,
  ): void {
    const args = new Args()
      .add(_tokenA)
      .add(_tokenB)
      .add(_binStep)
      .add(_ignored);
    call(this._origin, 'setLBPairIgnored', args, 0);
  }

  setPreset(
    _binStep: u32,
    _baseFactor: u32,
    _filterPeriod: u32,
    _decayPeriod: u32,
    _reductionFactor: u32,
    _variableFeeControl: u32,
    _protocolShare: u32,
    _maxVolatilityAccumulated: u32,
    _sampleLifeTime: u32,
  ): void {
    const args = new Args()
      .add(_binStep)
      .add(_baseFactor)
      .add(_filterPeriod)
      .add(_decayPeriod)
      .add(_reductionFactor)
      .add(_variableFeeControl)
      .add(_protocolShare)
      .add(_maxVolatilityAccumulated)
      .add(_sampleLifeTime);
    call(this._origin, 'setPreset', args, 0);
  }

  removePreset(_binStep: u32): void {
    call(this._origin, 'removePreset', new Args().add(_binStep), 0);
  }

  setFeesParametersOnPair(
    _tokenA: Address,
    _tokenB: Address,
    _binStep: u32,
    _baseFactor: u32,
    _filterPeriod: u32,
    _decayPeriod: u32,
    _reductionFactor: u32,
    _variableFeeControl: u32,
    _protocolShare: u32,
    _maxVolatilityAccumulated: u32,
  ): void {
    const args = new Args()
      .add(_tokenA)
      .add(_tokenB)
      .add(_binStep)
      .add(_baseFactor)
      .add(_filterPeriod)
      .add(_decayPeriod)
      .add(_reductionFactor)
      .add(_variableFeeControl)
      .add(_protocolShare)
      .add(_maxVolatilityAccumulated);
    call(this._origin, 'setFeesParametersOnPair', args, 0);
  }

  setLBHooksParametersOnPair(
    _tokenA: Address,
    _tokenB: Address,
    _binStep: u32,
    _hooksParameters: HooksParameters,
    _onHooksSetData: StaticArray<u8>,
  ): void {
    const args = new Args()
      .add(_tokenA)
      .add(_tokenB)
      .add(_binStep)
      .add(_hooksParameters)
      .add(_onHooksSetData);
    call(this._origin, 'setLBHooksParametersOnPair', args, 0);
  }

  removeLBHooksOnPair(_tokenA: Address, _tokenB: Address, _binStep: u32): void {
    const args = new Args().add(_tokenA).add(_tokenB).add(_binStep);
    call(this._origin, 'removeLBHooksOnPair', args, 0);
  }

  setFeeRecipient(_feeRecipient: Address): void {
    call(this._origin, 'setFeeRecipient', new Args().add(_feeRecipient), 0);
  }

  setFlashLoanFee(_flashLoanFee: u64): void {
    call(this._origin, 'setFlashLoanFee', new Args().add(_flashLoanFee), 0);
  }

  setFactoryLockedState(_factoryLockedState: bool): void {
    call(
      this._origin,
      'setFactoryLockedState',
      new Args().add(_factoryLockedState),
      0,
    );
  }

  addQuoteAsset(_asset: Address): void {
    call(this._origin, 'addQuoteAsset', new Args().add(_asset), 0);
  }

  removeQuoteAsset(_asset: Address): void {
    call(this._origin, 'removeQuoteAsset', new Args().add(_asset), 0);
  }

  forceDecay(_pair: Address): void {
    call(this._origin, 'forceDecay', new Args().add(_pair), 0);
  }

  proposeNewOwner(_newOwner: Address): void {
    call(this._origin, 'proposeNewOwner', new Args().add(_newOwner), 0);
  }

  acceptOwnership(): void {
    call(this._origin, 'forceDecay', NoArg, 0);
  }

  getAvailableLBPairBinSteps(_tokenA: Address, _tokenB: Address): u32[] {
    const args = new Args().add(_tokenA).add(_tokenB);
    const res = call(this._origin, 'getAvailableLBPairBinSteps', args, 0);
    return bytesToNativeTypeArray<u32>(res);
  }

  getOwner(): Address {
    return new Address(Storage.getOf(this._origin, OWNER_KEY));
  }

  getPreset(binstep: u32): Preset {
    const args = new Args().add(binstep);
    const res = call(this._origin, 'getPreset', args, 0);
    return new Args(res).nextSerializable<Preset>().unwrap();
  }
}
