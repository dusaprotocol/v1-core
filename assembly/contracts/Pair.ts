import {
  Address,
  balance,
  callerHasWriteAccess,
  Context,
  generateEvent,
  Storage,
  transferredCoins,
} from '@massalabs/massa-as-sdk';
import {
  Bin,
  Debt,
  FeeParameters,
  FeesDistribution,
  PairInformation,
  MintInfo,
  OracleParameters,
} from '../structs';
import {
  BASIS_POINT_MAX,
  BinHelper,
  PRECISION,
  SCALE_OFFSET,
  SwapHelper,
  Math512Bits,
  TreeHelper,
  SafeMath256,
  ReentrancyGuardUpgradeable,
  u256ToString,
  createEvent,
  transferRemaining,
  SafeMath,
  ONE_COIN,
  DELIMITER,
  createKey,
} from '../libraries';
import {
  Args,
  stringToBytes,
  boolToByte,
  fixedSizeArrayToBytes,
  u256ToBytes,
  bytesToNativeTypeArray,
  nativeTypeArrayToBytes,
  bytesToU64,
} from '@massalabs/as-types';
import { FEE_RECIPIENT, FLASH_LOAN_FEE } from '../storage/Factory';
import {
  FACTORY,
  TOKEN_X,
  TOKEN_Y,
  PAIR_INFORMATION,
  FEES_PARAMETERS,
  BINS,
  UNCLAIMED_FEES,
  ACCRUED_DEBTS,
  BALANCES,
  SPENDER_APPROVALS,
  TOTAL_SUPPLIES,
  DEPOSITED_BINS,
  ORACLE,
} from '../storage/Pair';
import { IERC20, IFlashLoanCallback } from '../interfaces';
import { u256 } from 'as-bignum/assembly/integer/u256';
import {
  LBPair__AddressZeroOrThis,
  LBPair__CompositionFactorFlawed,
  LBPair__DistributionsOverflow,
  LBPair__FlashLoanCallbackFailed,
  LBPair__FlashLoanInvalidBalance,
  LBPair__FlashLoanInvalidToken,
  LBPair__InsufficientAmounts,
  LBPair__InsufficientLiquidityBurned,
  LBPair__InsufficientLiquidityMinted,
  LBPair__OnlyFactory,
  LBPair__OnlyFeeRecipient,
  LBPair__OnlyStrictlyIncreasingId,
  LBPair__OracleNewSizeTooSmall,
  LBPair__WrongLengths,
  LBToken__BurnExceedsBalance,
  LBToken__LengthMismatch,
  LBToken__SelfApproval,
  LBToken__SpenderNotApproved,
  LBToken__TransferExceedsBalance,
  LBToken__TransferToSelf,
  LBPair__BinStepNotSame,
} from '../libraries/Errors';
import { Amounts, GetGlobalFeesReturn } from '../structs/Returns';

/**
 *
 * @notice Constructor
 * @param {StaticArray<u8>} bs - Byte string
 *
 */
export function constructor(bs: StaticArray<u8>): void {
  const SCBalance = balance();
  const sent = transferredCoins();

  assert(callerHasWriteAccess(), 'caller must have write access');

  const args = new Args(bs);

  const factory = new Address(args.nextString().expect('factory is missing'));
  Storage.set(FACTORY, factory.toString());

  const tokenX = new Address(args.nextString().expect('tokenX is missing'));
  Storage.set(TOKEN_X, tokenX.toString());
  const tokenY = new Address(args.nextString().expect('tokenY is missing'));
  Storage.set(TOKEN_Y, tokenY.toString());

  const activeId = args.nextU32().expect('activeId is missing');
  const pairInformation = new PairInformation(activeId);
  pairInformation.oracleSampleLifetime = args
    .nextU32()
    .expect('oracleSampleLifetime is missing');
  Storage.set(PAIR_INFORMATION, pairInformation.serialize());

  const fp = args
    .nextSerializable<FeeParameters>()
    .expect('feeParameters is missing');
  Storage.set(FEES_PARAMETERS, fp.serialize());

  // initialize oracle
  _increaseOracle(2);

  ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

  // Keep one Massa in the contract
  transferRemaining(
    SCBalance,
    SafeMath.sub(balance(), ONE_COIN),
    sent,
    Context.caller(),
  );
}

/**
 * Swap tokens iterating over the bins until the entire amount is swapped.
 * Will swap token X for token Y if `_swapForY` is true, and token Y for token X if `_swapForY` is false.
 * This function will not transfer the tokens from the caller, it is expected that the tokens have already been
 * transferred to this contract through another contract.
 * That is why this function shouldn't be called directly, but through one of the swap functions of the router
 * that will also perform safety checks.
 *
 * @param {StaticArray<u8>} bs - Byte string
 *
 */
export function swap(bs: StaticArray<u8>): StaticArray<u8> {
  ReentrancyGuardUpgradeable.nonReentrant();
  const SCBalance = balance();
  const sent = transferredCoins();
  const args = new Args(bs);
  const _swapForY = args.nextBool().expect('_swapForY is missing');
  const _to = new Address(args.nextString().expect('_to is missing'));

  const pair: PairInformation = _getPairInformation();
  const tokenX: IERC20 = getTokenX();
  const tokenY: IERC20 = getTokenY();
  let _amountIn: u256 = _swapForY
    ? tokenX.received(pair.reserveX, pair.feesX.total)
    : tokenY.received(pair.reserveY, pair.feesY.total);

  assert(!_amountIn.isZero(), LBPair__InsufficientAmounts());

  const _fp: FeeParameters = getFeeParameters();

  const _startId = pair.activeId;
  _fp.updateVariableFeeParameters(u64(_startId));

  let _amountOut = u256.Zero;
  /// Performs the actual swap, iterating over the bins until the entire amount is swapped.
  /// It uses the tree to find the next bin to have a non zero reserve of the token we're swapping for.
  /// It will also update the variable fee parameters.
  // eslint-disable-next-line @typescript-eslint/no-constant-condition
  while (true) {
    const _bin: Bin = _getBin(pair.activeId);
    if (
      (!_swapForY && !_bin.reserveX.isZero()) ||
      (_swapForY && !_bin.reserveY.isZero())
    ) {
      const r = SwapHelper.getAmounts(
        _bin,
        _fp,
        u64(pair.activeId),
        _swapForY,
        _amountIn,
      );

      _bin.updateFees(pair, r.fees, _swapForY, getTotalSupply(pair.activeId));
      _bin.updateReserves(pair, _swapForY, r.amountInToBin, r.amountOutOfBin);

      _amountIn = SafeMath256.sub(
        _amountIn,
        SafeMath256.add(r.amountInToBin, r.fees.total),
      );
      _amountOut = SafeMath256.add(_amountOut, r.amountOutOfBin);
      setBin(pair.activeId, _bin);

      // Avoids stack too deep error
      const event = createEvent('SWAP', [
        _to.toString(),
        pair.activeId.toString(),
        _swapForY.toString(),
        u256ToString(r.amountInToBin),
        u256ToString(r.amountOutOfBin),
        _fp.volatilityAccumulated.toString(),
        u256ToString(r.fees.total),
      ]);
      generateEvent(event);
    }

    /// If the amount in is not 0, it means that we haven't swapped the entire amount yet.
    /// We need to find the next bin to swap for.
    if (!_amountIn.isZero()) {
      pair.activeId = TreeHelper.findFirstBin(
        pair.activeId,
        _swapForY,
      ).unwrap();
    } else {
      break;
    }
  }

  // Update the oracle and return the updated oracle id. It uses the oracle size to start filling the new slots.
  const _updatedOracleId = ORACLE.update(
    pair.oracleSize,
    pair.oracleSampleLifetime,
    pair.oracleLastTimestamp,
    pair.oracleId,
    pair.activeId,
    _fp.volatilityAccumulated,
    abs(i64(_startId) - i64(pair.activeId)) as u64,
  ) as u32;
  // Update the oracleId and lastTimestamp if the sample write on another slot
  if (_updatedOracleId != pair.oracleId || pair.oracleLastTimestamp == 0) {
    // Can't overflow as the updatedOracleId < oracleSize
    pair.oracleId = _updatedOracleId;
    pair.oracleLastTimestamp = Context.timestamp() / 1000;

    if (_updatedOracleId >= pair.oracleActiveSize) pair.oracleActiveSize += 1;
  }

  /// Update the fee parameters and the pair information
  Storage.set(FEES_PARAMETERS, _fp.serialize());
  Storage.set(PAIR_INFORMATION, pair.serialize());

  if (_swapForY) {
    tokenY.transfer(_to, _amountOut);
  } else {
    tokenX.transfer(_to, _amountOut);
  }

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  ReentrancyGuardUpgradeable.endNonReentrant();
  return u256ToBytes(_amountOut);
}

/**
 * Perform a flashloan on one of the tokens of the pair. The flashloan will call the `_receiver` contract
 * to perform the desired operations. The `_receiver` contract is expected to transfer the `amount + fee` of the
 * token to this contract.
 *
 * @param {StaticArray<u8>} bs - Byte string
 *
 */
export function flashLoan(bs: StaticArray<u8>): void {
  ReentrancyGuardUpgradeable.nonReentrant();
  const SCBalance = balance();
  const sent = transferredCoins();
  const caller = Context.caller();
  const args = new Args(bs);
  const _receiver = new IFlashLoanCallback(caller);
  const _token = new IERC20(
    new Address(args.nextString().expect('_token is missing')),
  );
  const _amount = args.nextU256().expect('_amount is missing');

  const _tokenX = getTokenX();
  assert(
    _token.equals(_tokenX) || _token.equals(getTokenY()),
    LBPair__FlashLoanInvalidToken(),
  );

  const _totalFee = _getFlashLoanFee(_amount);

  const _fees: FeesDistribution = new FeesDistribution(
    _totalFee,
    u256.div(
      SafeMath256.mul(_totalFee, u256.from(getFeeParameters().protocolShare)),
      u256.from(BASIS_POINT_MAX),
    ),
  );

  const _balanceBefore = _token.balanceOf(Context.callee());

  _token.transfer(_receiver._origin, _amount);

  assert(
    _receiver.flashLoanCallback(caller, _token, _amount, _fees.total),
    LBPair__FlashLoanCallbackFailed(),
  );

  const _balanceAfter = _token.balanceOf(Context.callee());

  assert(
    _balanceAfter >= SafeMath256.add(_balanceBefore, _fees.total),
    LBPair__FlashLoanInvalidBalance(),
  );

  const _activeId = _getPairInformation().activeId;
  const _totalSupply: u256 = getTotalSupply(_activeId);

  if (_totalFee > u256.Zero) {
    const bin = _getBin(_activeId);
    if (_token.equals(_tokenX)) {
      const r = _getGlobalFees();
      _setFees(
        true,
        SafeMath256.add(r.feesX.total, _fees.total),
        SafeMath256.add(r.feesX.protocol, _fees.protocol),
      );
      bin.accTokenXPerShare = SafeMath256.add(
        bin.accTokenXPerShare,
        _fees.getTokenPerShare(_totalSupply),
      );
    } else {
      const r = _getGlobalFees();
      _setFees(
        false,
        SafeMath256.add(r.feesY.total, _fees.total),
        SafeMath256.add(r.feesY.protocol, _fees.protocol),
      );
      bin.accTokenYPerShare = SafeMath256.add(
        bin.accTokenYPerShare,
        _fees.getTokenPerShare(_totalSupply),
      );
    }
  }

  const event = createEvent('FLASHLOAN', [
    Context.caller().toString(),
    _receiver._origin.toString(),
    _token._origin.toString(),
    u256ToString(_amount),
    u256ToString(_fees.total),
  ]);
  generateEvent(event);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  ReentrancyGuardUpgradeable.endNonReentrant();
}

/**
 * Mint new LB tokens for each bins where the user adds liquidity.
 * This function will not transfer the tokens from the caller, it is expected that the tokens have already been
 * transferred to this contract through another contract.
 * That is why this function shouldn't be called directly, but through one of the add liquidity functions of the
 * router that will also perform safety checks.
 *
 * @param {StaticArray<u8>} bs - Byte string
 *
 */
export function mint(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = transferredCoins();

  ReentrancyGuardUpgradeable.nonReentrant();
  const args = new Args(bs);
  const _ids: u64[] = args.nextFixedSizeArray<u64>().expect('_ids is missing');
  const _distributionX: u256[] = args
    .nextFixedSizeArray<u256>()
    .expect('_distributionX is missing');
  const _distributionY: u256[] = args
    .nextFixedSizeArray<u256>()
    .expect('_distributionY is missing');
  const _to = new Address(args.nextString().expect('_to is missing'));

  if (
    _ids.length == 0 ||
    _ids.length != _distributionX.length ||
    _ids.length != _distributionY.length
  )
    assert(false, LBPair__WrongLengths());

  const _pair: PairInformation = _getPairInformation();
  const _fp: FeeParameters = getFeeParameters();
  const _mintInfo: MintInfo = new MintInfo();
  const tokenX: IERC20 = getTokenX();
  const tokenY: IERC20 = getTokenY();

  _mintInfo.amountXIn = tokenX.received(_pair.reserveX, _pair.feesX.total);
  _mintInfo.amountYIn = tokenY.received(_pair.reserveY, _pair.feesY.total);

  const liquidityMinted: u256[] = [];

  for (let i = 0; i < _ids.length; i++) {
    _mintInfo.id = _ids[i];
    const _bin: Bin = _getBin(_mintInfo.id as u32);

    if (_bin.reserveX.isZero() && _bin.reserveY.isZero()) {
      TreeHelper.addToTree(_mintInfo.id);
    }

    _mintInfo.totalDistributionX = SafeMath256.add(
      _mintInfo.totalDistributionX,
      _distributionX[i],
    );
    _mintInfo.totalDistributionY = SafeMath256.add(
      _mintInfo.totalDistributionY,
      _distributionY[i],
    );

    _mintInfo.amountX = u256.div(
      SafeMath256.mul(_mintInfo.amountXIn, _distributionX[i]),
      PRECISION,
    );
    _mintInfo.amountY = u256.div(
      SafeMath256.mul(_mintInfo.amountYIn, _distributionY[i]),
      PRECISION,
    );

    const _price: u256 = BinHelper.getPriceFromId(_mintInfo.id, _fp.binStep);

    if (_mintInfo.id >= _pair.activeId) {
      // The active bin is the only bin that can have a non-zero reserve of the two tokens. When adding liquidity
      // with a different ratio than the active bin, the user would actually perform a swap without paying any
      // fees. This is why we calculate the fees for the active bin here.
      if (_mintInfo.id == _pair.activeId) {
        if (!_bin.reserveX.isZero() || !_bin.reserveY.isZero()) {
          const _totalSupply: u256 = getTotalSupply(_mintInfo.id);
          let _receivedX: u256 = u256.Zero;
          let _receivedY: u256 = u256.Zero;

          const _userL: u256 = SafeMath256.add(
            Math512Bits.mulShiftRoundDown(
              _price,
              _mintInfo.amountX,
              SCALE_OFFSET,
            ),
            _mintInfo.amountY,
          );

          const _supply: u256 = SafeMath256.add(_totalSupply, _userL);

          _receivedX = Math512Bits.mulDivRoundDown(
            _userL,
            SafeMath256.add(_bin.reserveX, _mintInfo.amountX),
            _supply,
          );
          _receivedY = Math512Bits.mulDivRoundDown(
            _userL,
            SafeMath256.add(_bin.reserveY, _mintInfo.amountY),
            _supply,
          );

          _fp.updateVariableFeeParameters(_mintInfo.id);

          let _fees: FeesDistribution = new FeesDistribution();

          if (_mintInfo.amountX > _receivedX) {
            // Can't overflow as _mintInfo.amountX > _receivedX
            _fees = _fp.getFeeAmountDistribution(
              _fp.getFeeAmountForC(u256.sub(_mintInfo.amountX, _receivedX)),
            );

            _mintInfo.amountX = SafeMath256.sub(_mintInfo.amountX, _fees.total);
            _mintInfo.activeFeeX = SafeMath256.add(
              _mintInfo.activeFeeX,
              _fees.total,
            );

            _bin.updateFees(_pair, _fees, true, _totalSupply);
          }
          if (_mintInfo.amountY > _receivedY) {
            // Can't overflow as _mintInfo.amountY > _receivedY
            _fees = _fp.getFeeAmountDistribution(
              _fp.getFeeAmountForC(u256.sub(_mintInfo.amountY, _receivedY)),
            );

            _mintInfo.amountY = SafeMath256.sub(_mintInfo.amountY, _fees.total);
            _mintInfo.activeFeeY = SafeMath256.add(
              _mintInfo.activeFeeY,
              _fees.total,
            );

            _bin.updateFees(_pair, _fees, false, _totalSupply);
          }
          if (
            _mintInfo.activeFeeX > u256.Zero ||
            _mintInfo.activeFeeY > u256.Zero
          ) {
            const args: string[] = [
              _to.toString(),
              _mintInfo.id.toString(),
              u256ToString(_mintInfo.activeFeeX),
              u256ToString(_mintInfo.activeFeeY),
            ];
            const event = createEvent('COMPOSITION_FEE', args);
            generateEvent(event);
          }
        }
      } else
        assert(
          _mintInfo.amountY.isZero(),
          LBPair__CompositionFactorFlawed(_mintInfo.id),
        );
    } else
      assert(
        _mintInfo.amountX.isZero(),
        LBPair__CompositionFactorFlawed(_mintInfo.id),
      );

    const _liquidity: u256 = SafeMath256.add(
      Math512Bits.mulShiftRoundDown(_price, _mintInfo.amountX, SCALE_OFFSET),
      _mintInfo.amountY,
    );
    assert(
      !_liquidity.isZero(),
      LBPair__InsufficientLiquidityMinted(_mintInfo.id),
    );

    liquidityMinted[i] = _liquidity;

    _bin.reserveX = SafeMath256.add(_bin.reserveX, _mintInfo.amountX);
    _bin.reserveY = SafeMath256.add(_bin.reserveY, _mintInfo.amountY);

    _pair.reserveX = SafeMath256.add(_pair.reserveX, _mintInfo.amountX);
    _pair.reserveY = SafeMath256.add(_pair.reserveY, _mintInfo.amountY);

    _mintInfo.amountXAddedToPair = SafeMath256.add(
      _mintInfo.amountXAddedToPair,
      _mintInfo.amountX,
    );
    _mintInfo.amountYAddedToPair = SafeMath256.add(
      _mintInfo.amountYAddedToPair,
      _mintInfo.amountY,
    );

    setBin(_mintInfo.id as u32, _bin);

    _mint(_to, _mintInfo.id, _liquidity);

    const event = createEvent('DEPOSITED_TO_BIN', [
      _to.toString(),
      _mintInfo.id.toString(),
      u256ToString(_mintInfo.amountX),
      u256ToString(_mintInfo.amountY),
    ]);
    generateEvent(event);
  }

  if (
    _mintInfo.totalDistributionX > PRECISION ||
    _mintInfo.totalDistributionY > PRECISION
  )
    assert(false, LBPair__DistributionsOverflow());

  Storage.set(PAIR_INFORMATION, _pair.serialize());
  Storage.set(FEES_PARAMETERS, _fp.serialize());

  // Can't overflow as _mintInfo.amountXAddedToPair + _mintInfo.amountYAddedToPair <= _mintInfo.amountXIn + _mintInfo.amountYIn
  const _amountXAddedPlusFee: u256 = u256.add(
    _mintInfo.amountXAddedToPair,
    _mintInfo.activeFeeX,
  );
  if (_mintInfo.amountXIn > _amountXAddedPlusFee) {
    tokenX.transfer(_to, u256.sub(_mintInfo.amountXIn, _amountXAddedPlusFee));
  }

  // Can't overflow as _mintInfo.amountYAddedToPair + _mintInfo.amountYAddedToPair <= _mintInfo.amountXIn + _mintInfo.amountYIn
  const _amountYAddedPlusFee: u256 = u256.add(
    _mintInfo.amountYAddedToPair,
    _mintInfo.activeFeeY,
  );
  if (_mintInfo.amountYIn > _amountYAddedPlusFee) {
    tokenY.transfer(_to, u256.sub(_mintInfo.amountYIn, _amountYAddedPlusFee));
  }
  _addDepositedBins(_to, _ids);

  ReentrancyGuardUpgradeable.endNonReentrant();

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return new Args()
    .add(_mintInfo.amountXAddedToPair)
    .add(_mintInfo.amountYAddedToPair)
    .add(liquidityMinted)
    .serialize();
}

/**
 * Burns LB tokens and sends the corresponding amounts of tokens to `_to`. The amount of tokens sent is
 * determined by the ratio of the amount of LB tokens burned to the total supply of LB tokens in the bin.
 * This function will not transfer the LB Tokens from the caller, it is expected that the tokens have already been
 * transferred to this contract through another contract.
 * That is why this function shouldn't be called directly, but through one of the remove liquidity functions of the router
 * that will also perform safety checks.
 *
 * @param {StaticArray<u8>} bs - Byte string
 *
 */
export function burn(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = transferredCoins();

  ReentrancyGuardUpgradeable.nonReentrant();
  const args = new Args(bs);
  const _ids: u64[] = args.nextFixedSizeArray<u64>().expect('_ids is missing');
  const _amounts: u256[] = args
    .nextFixedSizeArray<u256>()
    .expect('_amounts is missing');
  const _to = new Address(args.nextString().expect('_to is missing'));

  let amountX: u256 = u256.Zero;
  let amountY: u256 = u256.Zero;

  assert(
    _ids.length != 0 && _ids.length == _amounts.length,
    LBPair__WrongLengths(),
  );

  const pair: PairInformation = _getPairInformation();
  const tokenX: IERC20 = getTokenX();
  const tokenY: IERC20 = getTokenY();

  for (let i = 0; i < _ids.length; ++i) {
    const _id = _ids[i] as u32;
    const _amountToBurn: u256 = _amounts[i];

    assert(!_amountToBurn.isZero(), LBPair__InsufficientLiquidityBurned(_id));

    const bin = _getBin(_id);

    const _totalSupply: u256 = getTotalSupply(_id);

    let _amountX: u256 = u256.Zero;
    let _amountY: u256 = u256.Zero;

    if (_id <= pair.activeId) {
      _amountY = Math512Bits.mulDivRoundDown(
        _amountToBurn,
        bin.reserveY,
        _totalSupply,
      );
      amountY = SafeMath256.add(amountY, _amountY);
      bin.reserveY = SafeMath256.sub(bin.reserveY, _amountY);
      pair.reserveY = SafeMath256.sub(pair.reserveY, _amountY);
    }
    if (_id >= pair.activeId) {
      _amountX = Math512Bits.mulDivRoundDown(
        _amountToBurn,
        bin.reserveX,
        _totalSupply,
      );
      amountX = SafeMath256.add(amountX, _amountX);
      bin.reserveX = SafeMath256.sub(bin.reserveX, _amountX);
      pair.reserveX = SafeMath256.sub(pair.reserveX, _amountX);
    }

    if (pair.reserveX.isZero() && pair.reserveY.isZero())
      TreeHelper.removeFromTree(_id);

    setBin(_id, bin);

    _burn(Context.callee(), _id, _amountToBurn);

    const event = createEvent('WITHDRAWN_FROM_BIN', [
      _to.toString(),
      _id.toString(),
      u256ToString(_amountX),
      u256ToString(_amountY),
    ]);
    generateEvent(event);
  }

  Storage.set(PAIR_INFORMATION, pair.serialize());

  tokenX.transfer(_to, amountX);
  tokenY.transfer(_to, amountY);

  ReentrancyGuardUpgradeable.endNonReentrant();

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return new Args().add(amountX).add(amountY).serialize();
}

/**
 * Collect the fees accumulated by a user.
 *
 * @param {StaticArray<u8>} bs - Byte string
 *
 */
export function collectFees(bs: StaticArray<u8>): StaticArray<u8> {
  const SCBalance = balance();
  const sent = transferredCoins();

  ReentrancyGuardUpgradeable.nonReentrant();
  const args = new Args(bs);
  const _account = new Address(args.nextString().expect('_account is missing'));
  const _ids: u64[] = args.nextFixedSizeArray<u64>().expect('_ids is missing');

  const unclaimed = _collectfees(_account, _ids);

  ReentrancyGuardUpgradeable.endNonReentrant();

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  return new Args().add(unclaimed.amountX).add(unclaimed.amountY).serialize();
}

/**
 * Collect the fees accumulated by a user.
 * @param _account The address of the user
 * @param _ids The ids of the bins for which to collect the fees
 * @return amountX The amount of token X collected and sent to `_account`
 * @return amountY The amount of token Y collected and sent to `_account`
 */
function _collectfees(_account: Address, _ids: u64[]): Amounts {
  const tokenX: IERC20 = getTokenX();
  const tokenY: IERC20 = getTokenY();

  _noAddressZeroOrThis(_account);

  const unclaimed = getUnclaimedFees(_account);
  if (UNCLAIMED_FEES.contains(_account.toString()))
    UNCLAIMED_FEES.delete(_account.toString());

  // Iterate over the ids to collect the fees
  for (let i = 0; i < _ids.length; ++i) {
    const _id = _ids[i] as u32;
    const _balance = getBalance(_id, _account);

    if (!_balance.isZero()) {
      const _bin = _getBin(_id);
      const pending = _getPendingFees(_bin, _account, _id, _balance);
      _updateUserDebts(_bin, _account, _id, _balance);

      unclaimed.amountX = SafeMath256.add(unclaimed.amountX, pending.amountX);
      unclaimed.amountY = SafeMath256.add(unclaimed.amountY, pending.amountY);
    }
  }

  const _pair = _getPairInformation();

  if (!unclaimed.amountX.isZero()) {
    _pair.feesX.total = SafeMath256.sub(_pair.feesX.total, unclaimed.amountX);
  }
  if (!unclaimed.amountY.isZero()) {
    _pair.feesY.total = SafeMath256.sub(_pair.feesY.total, unclaimed.amountY);
  }
  Storage.set(PAIR_INFORMATION, _pair.serialize());

  tokenX.transfer(_account, unclaimed.amountX);
  tokenY.transfer(_account, unclaimed.amountY);

  const event = createEvent('FEES_COLLECTED', [
    Context.caller().toString(),
    _account.toString(),
    u256ToString(unclaimed.amountX),
    u256ToString(unclaimed.amountY),
  ]);
  generateEvent(event);

  return unclaimed;
}

/**
 * Collect the protocol fees and send them to the fee recipient.
 * The protocol fees are not set to zero to save gas by not resetting the storage slot.
 *
 */
export function collectProtocolFees(_: StaticArray<u8>): StaticArray<u8> {
  ReentrancyGuardUpgradeable.nonReentrant();
  const SCBalance = balance();
  const sent = transferredCoins();
  const factory = getFactory();
  const _feeRecipient = new Address(Storage.getOf(factory, FEE_RECIPIENT));

  assert(
    Context.caller().equals(_feeRecipient),
    LBPair__OnlyFeeRecipient(_feeRecipient, Context.caller()),
  );

  const r = _getGlobalFees();
  let amountX: u256 = u256.Zero;
  let amountY: u256 = u256.Zero;
  const tokenX: IERC20 = getTokenX();
  const tokenY: IERC20 = getTokenY();

  // The protocol fees are not set to 0 to reduce the gas cost during a swap
  if (r.feesX.protocol > u256.One) {
    amountX = SafeMath256.sub(r.feesX.protocol, u256.One);
    r.feesX.total = SafeMath256.sub(r.feesX.total, amountX);

    _setFees(true, r.feesX.total, u256.One);
    tokenX.transfer(_feeRecipient, amountX);
  }

  if (r.feesY.protocol > u256.One) {
    amountY = SafeMath256.sub(r.feesY.protocol, u256.One);
    r.feesY.total = SafeMath256.sub(r.feesY.total, amountY);

    _setFees(false, r.feesY.total, u256.One);
    tokenY.transfer(_feeRecipient, amountY);
  }

  const event = createEvent('PROTOCOL_FEES_COLLECTED', [
    Context.caller().toString(),
    _feeRecipient.toString(),
    u256ToString(amountX),
    u256ToString(amountY),
  ]);
  generateEvent(event);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  ReentrancyGuardUpgradeable.endNonReentrant();
  return new Args().add(amountX).add(amountY).serialize();
}

/**
 * View function to get the pending fees of a user
 * The array must be strictly increasing to ensure uniqueness
 * @param {StaticArray<u8>} bs - Byte string
 *
 */
export function pendingFees(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _account = new Address(args.nextString().expect('_account is missing'));
  const _ids: u64[] = args.nextFixedSizeArray<u64>().expect('_ids is missing');

  _noAddressZeroOrThis(_account);

  const unclaimed = getUnclaimedFees(_account);

  let _lastId: u64 = 0;

  for (let i = 0; i < _ids.length; i++) {
    const _id = _ids[i] as u32;

    // Ensures uniqueness of ids
    assert(_lastId < _id || i == 0, LBPair__OnlyStrictlyIncreasingId());

    const _balance = getBalance(_id, _account);

    if (!_balance.isZero()) {
      const _bin = _getBin(_id);
      const pending = _getPendingFees(_bin, _account, _id, _balance);

      unclaimed.amountX = SafeMath256.add(unclaimed.amountX, pending.amountX);
      unclaimed.amountY = SafeMath256.add(unclaimed.amountY, pending.amountY);
    }
    _lastId = _id;
  }

  return new Args().add(unclaimed.amountX).add(unclaimed.amountY).serialize();
}

/**
 * Increases the length of the oracle to the given `_newLength` by adding empty samples to the end of the oracle.
 * The samples are however initialized to reduce the gas cost of the updates during a swap.
 */
export function increaseOracleLength(bs: StaticArray<u8>): void {
  const SCBalance = balance();
  const sent = transferredCoins();
  const _newSize = new Args(bs).nextU32().expect('_newSize is missing');
  _increaseOracle(_newSize);

  transferRemaining(SCBalance, balance(), sent, Context.caller());
}

function _increaseOracle(_newSize: u32): void {
  const pairInfo = _getPairInformation();
  const _oracleSize = pairInfo.oracleSize;
  assert(
    _oracleSize < _newSize,
    LBPair__OracleNewSizeTooSmall(_newSize, _oracleSize),
  );
  pairInfo.oracleSize = _newSize;

  for (let _id = _oracleSize; _id < _newSize; _id++) {
    ORACLE.initialize(_id);
  }

  Storage.set(PAIR_INFORMATION, pairInfo.serialize());

  const event = createEvent('OracleSizeIncreased', [
    _oracleSize.toString(),
    _newSize.toString(),
  ]);
  generateEvent(event);
}

/**
 * Update the user debts of a user on a given bin
 * @param _bin The bin data where the user has collected fees
 * @param _account The address of the user
 * @param _id The id where the user has collected fees
 * @param _balance The new balance of the user
 */
function _updateUserDebts(
  _bin: Bin,
  _account: Address,
  _id: u64,
  _balance: u256,
): void {
  const _debtX = Math512Bits.mulShiftRoundDown(
    _bin.accTokenXPerShare,
    _balance,
    SCALE_OFFSET,
  );
  const _debtY = Math512Bits.mulShiftRoundDown(
    _bin.accTokenYPerShare,
    _balance,
    SCALE_OFFSET,
  );

  const key = createKey([_account.toString(), _id.toString()]);
  ACCRUED_DEBTS.set(key, new Debt(_debtX, _debtY));
}

/**
 * Cache the accrued fees for a user before any transfer, mint or burn of LB tokens.
 * The tokens are not transferred to reduce the gas cost and to avoid reentrancy.
 * @param from The address of the sender of the tokens
 * @param to The address of the receiver of the tokens
 * @param id The id of the bin
 * @param amount The amount of LB tokens transferred
 */
function _beforeTokenTransfer(
  from: Address,
  to: Address,
  id: u64,
  amount: u256,
): void {
  if (from.notEqual(to)) {
    const bin = _getBin(id as u32);
    if (from.notEqual(new Address('0')) && from.notEqual(Context.callee())) {
      const balanceFrom = getBalance(id, from);
      _cacheFees(
        bin,
        from,
        id,
        balanceFrom,
        SafeMath256.sub(balanceFrom, amount),
      );
    }
    if (to.notEqual(new Address('0')) && to.notEqual(Context.callee())) {
      const balanceTo = getBalance(id, to);
      _cacheFees(bin, to, id, balanceTo, SafeMath256.add(balanceTo, amount));
    }
  }
}

/**
 * Cache the accrued fees for a user.
 * @param _bin The bin data where the user is receiving LB tokens
 * @param _user The address of the user
 * @param _id The id of the bin
 * @param _balance The previous balance of the user
 * @param _newBalance The new balance of the user
 */
function _cacheFees(
  _bin: Bin,
  _user: Address,
  _id: u64,
  _previousBalance: u256,
  _newBalance: u256,
): void {
  const unclaimed = getUnclaimedFees(_user);

  const pending = _getPendingFees(_bin, _user, _id, _previousBalance);
  _updateUserDebts(_bin, _user, _id, _newBalance);

  if (pending.amountX > u256.Zero || pending.amountY > u256.Zero) {
    unclaimed.amountX = SafeMath256.add(unclaimed.amountX, pending.amountX);
    unclaimed.amountY = SafeMath256.add(unclaimed.amountY, pending.amountY);
    UNCLAIMED_FEES.set(
      _user.toString(),
      new Args().add(unclaimed.amountX).add(unclaimed.amountY).serialize(),
    );
  }
}

/**
 * Force the decaying of the references for volatility and index
 * @dev Only callable by the factory
 * @param {StaticArray<u8>} _ - unused
 */
export function forceDecay(_: StaticArray<u8>): void {
  _onlyFactory();

  const _feeParameters = getFeeParameters();
  _feeParameters.volatilityReference = ((u64(_feeParameters.reductionFactor) *
    u64(_feeParameters.volatilityReference)) /
    BASIS_POINT_MAX) as u32;
  _feeParameters.indexRef = _getPairInformation().activeId;
  setFeesParameters(_feeParameters.serialize());

  const event = createEvent('FORCE_DECAY', [
    _feeParameters.volatilityReference.toString(),
    _feeParameters.indexRef.toString(),
  ]);
  generateEvent(event);
}

/**
 *View function to get the first bin that isn't empty, will not be `_id` itself
 */
export function findFirstNonEmptyBinId(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const id = args.nextU32().expect('id is missing');
  const sentTokenY = args.nextBool().expect('sentTokenY is missing');

  const res = TreeHelper.findFirstBin(id, sentTokenY);
  if (res.isOk()) return new Args().add(res.unwrap()).serialize();
  return new Args()
    .add(u32(0))
    .add(res.error || '')
    .serialize();
}

// ======================================================== //
// ====                    GETTERS                     ==== //
// ======================================================== //

/**
 * Get the deposited bins of an account
 */
export function getUserBins(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _account = new Address(args.nextString().expect('_account is missing'));

  const bins = _getUserBins(_account);
  return new Args().add(bins).serialize();
}

function _getUserBins(account: Address): u32[] {
  const userBinsBs = DEPOSITED_BINS.get(account.toString(), []);
  return bytesToNativeTypeArray<u32>(userBinsBs);
}

/**
 * Get the factory contract that created this pair
 */
function getFactory(): Address {
  return new Address(Storage.get(FACTORY));
}

/**
 * Get the pair information that is used to track reserves, active ids,
 * fees and oracle parameters
 */
export function getPairInformation(_: StaticArray<u8>): StaticArray<u8> {
  return _getPairInformation().serialize();
}

function _getPairInformation(): PairInformation {
  const bs = Storage.get(PAIR_INFORMATION);
  return new Args(bs).nextSerializable<PairInformation>().unwrap();
}

/**
 * Get the token that is used as the base currency for the pair
 */
function getTokenX(): IERC20 {
  return new IERC20(new Address(Storage.get(TOKEN_X)));
}

/**
 * Get the token that is used as the quote currency for the pair
 */
function getTokenY(): IERC20 {
  return new IERC20(new Address(Storage.get(TOKEN_Y)));
}

/**
 * Get the fee parameters that are used to calculate fees
 */
function getFeeParameters(): FeeParameters {
  const bs = Storage.get(FEES_PARAMETERS);
  return new Args(bs).nextSerializable<FeeParameters>().unwrap();
}

/**
 * Get the reserves of tokens for every bin. This is the amount
 * of tokenY if `id < _pairInformation.activeId`; of tokenX if `id > _pairInformation.activeId`
 * and a mix of both if `id == _pairInformation.activeId`
 */
export function getBin(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _id = args.nextU32().expect('_id is missing');
  const _bin = _getBin(_id);
  return _bin.serialize();
}

function _getBin(id: u32): Bin {
  return BINS.get(id, new Bin());
}

/**
 * Get the user's unclaimed fees seperated in tokenX and tokenY
 */
function getUnclaimedFees(_account: Address): Amounts {
  const _unclaimedData = UNCLAIMED_FEES.get(
    _account.toString(),
    new Args().add(u256.Zero).add(u256.Zero).serialize(),
  );
  const bs = new Args(_unclaimedData);
  return new Amounts(bs.nextU256().unwrap(), bs.nextU256().unwrap());
}

/**
 * View function to get the total fees and the protocol fees of each tokens
 * @param {StaticArray<u8>} _ - unused
 * @returns staticArray<u8> containing :
 *  -feesX.total The total fees of tokenX
 *  -feesY.total The total fees of tokenY
 *  -feesX.protocol The protocol fees of tokenX
 *  -feesY.protocol The protocol fees of tokenY
 */
export function getGlobalFees(_: StaticArray<u8>): StaticArray<u8> {
  const r = _getGlobalFees();
  return new Args()
    .add(r.feesX.total)
    .add(r.feesY.total)
    .add(r.feesX.protocol)
    .add(r.feesY.protocol)
    .serialize();
}

/**
 * Return the total fees for X & Y and the protocol fees for X & Y of the pair
 * The fees for users can be computed by subtracting the protocol fees from the total fees
 *
 */
function _getGlobalFees(): GetGlobalFeesReturn {
  const _pair = _getPairInformation();
  return new GetGlobalFeesReturn(_pair.feesX, _pair.feesY);
}

/**
 * Return the fee added to a flashloan
 * @dev Rounds up the amount of fees
 * @param _amount The amount of the flashloan
 * @return The fee added to the flashloan
 */
function _getFlashLoanFee(_amount: u256): u256 {
  const factory = getFactory();
  const _fee = u256.from(bytesToU64(Storage.getOf(factory, FLASH_LOAN_FEE)));

  return u256.div(
    u256.sub(
      SafeMath256.add(SafeMath256.mul(_amount, _fee), PRECISION),
      u256.One,
    ),
    PRECISION,
  );
}

/**
 * View function to get the pending fees of an account on a given bin
 * @param _bin The bin data where the user is collecting fees
 * @param _account The address of the user
 * @param _id The id where the user is collecting fees
 * @param _balance The previous balance of the user
 * @return amountX The amount of token X not collected yet by `_account`
 * @return amountY The amount of token Y not collected yet by `_account`
 */
function _getPendingFees(
  _bin: Bin,
  _account: Address,
  _id: u64,
  _balance: u256,
): Amounts {
  const key = createKey([_account.toString(), _id.toString()]);
  const debts = ACCRUED_DEBTS.get(key, new Debt());
  const amountX = SafeMath256.sub(
    Math512Bits.mulShiftRoundDown(
      _bin.accTokenXPerShare,
      _balance,
      SCALE_OFFSET,
    ),
    debts.debtX,
  );
  const amountY = SafeMath256.sub(
    Math512Bits.mulShiftRoundDown(
      _bin.accTokenYPerShare,
      _balance,
      SCALE_OFFSET,
    ),
    debts.debtY,
  );
  return new Amounts(amountX, amountY);
}

/**
 * View function to get the oracle parameters
 */
export function getOracleParameters(_: StaticArray<u8>): StaticArray<u8> {
  const _oracleParameters = _getOracleParameters();
  _oracleParameters.min =
    _oracleParameters.oracleActiveSize == 0
      ? 0
      : _oracleParameters.oracleSampleLifetime;
  _oracleParameters.max =
    _oracleParameters.oracleSampleLifetime * _oracleParameters.oracleActiveSize;

  return _oracleParameters.serialize();
}

/**
 * View function to get the oracle's sample at `_timeDelta` seconds
 * @dev Return a linearized sample, the weighted average of 2 neighboring samples
 */
export function getOracleSampleFrom(bs: StaticArray<u8>): StaticArray<u8> {
  const _timeDelta = new Args(bs).nextU64().expect('_timeDelta is missing');
  const _lookUpTimestamp = Context.timestamp() / 1000 - _timeDelta;

  const op = _getOracleParameters();
  const r = ORACLE.getSampleAt(
    op.oracleActiveSize,
    op.oracleId,
    _lookUpTimestamp,
  );

  if (r.timestamp < _lookUpTimestamp) {
    const _fp: FeeParameters = getFeeParameters();

    const activeId = _getPairInformation().activeId as u64;
    _fp.updateVariableFeeParameters(activeId);

    const _deltaT = u256.from(_lookUpTimestamp - r.timestamp);

    // unsafe math is fine
    r.cumulativeId = u256.add(
      u256.mul(_deltaT, u256.from(activeId)),
      r.cumulativeId,
    );
    r.cumulativeVolatilityAccumulated = u256.add(
      u256.mul(_deltaT, u256.from(_fp.volatilityAccumulated)),
      r.cumulativeVolatilityAccumulated,
    );
  }

  return new Args()
    .add(r.cumulativeId)
    .add(r.cumulativeVolatilityAccumulated)
    .add(r.cumulativeBinCrossed)
    .serialize();
}

function _getOracleParameters(): OracleParameters {
  const pairInfo = _getPairInformation();
  return new OracleParameters(
    pairInfo.oracleSampleLifetime,
    pairInfo.oracleSize,
    pairInfo.oracleActiveSize,
    pairInfo.oracleLastTimestamp,
    pairInfo.oracleId,
  );
}

// ======================================================== //
// ====                    SETTERS                     ==== //
// ======================================================== //

/**
 * @dev The reserves of tokens for every bin. This is the amount
 * of tokenY if `id < _pairInformation.activeId`;
 * of tokenX if `id > _pairInformation.activeId`
 * and a mix of both if `id == _pairInformation.activeId`
 */
function setBin(_id: u32, _bin: Bin): void {
  BINS.set(_id, _bin);
}

/**
 * Set the fees parameters
 * @dev Needs to be called by the factory that will validate the values
 * The bin step will not change
 * Only callable by the factory
 */
export function setFeesParameters(bs: StaticArray<u8>): void {
  _onlyFactory();
  const _fp = new Args(bs)
    .nextSerializable<FeeParameters>()
    .expect('_feeParameters is missing');
  assert(_fp.binStep == getFeeParameters().binStep, LBPair__BinStepNotSame());
  Storage.set(FEES_PARAMETERS, _fp.serialize());
}

/**
 * Set the total and protocol fees
 * @param tokenX Whether to set the fees for tokenX or tokenY
 * @param _totalFees The new total fees
 * @param _protocolFees The new protocol fees
 */
function _setFees(tokenX: bool, _totalFees: u256, _protocolFees: u256): void {
  const _pair = _getPairInformation();
  if (tokenX) {
    _pair.feesX.protocol = _protocolFees;
    _pair.feesX.total = _totalFees;
  } else {
    _pair.feesY.protocol = _protocolFees;
    _pair.feesY.total = _totalFees;
  }
  Storage.set(PAIR_INFORMATION, _pair.serialize());
}

// ======================================================== //
// ====                    MODIFIERS                   ==== //
// ======================================================== //

/**
 * Checks if the caller is the factory
 */
function _onlyFactory(): void {
  assert(Context.caller().equals(getFactory()), LBPair__OnlyFactory());
}

/**
 * Checks if the caller is the address zero or the contract itself
 */
function _noAddressZeroOrThis(account: Address): void {
  // check address zero needed?
  assert(account.notEqual(Context.callee()), LBPair__AddressZeroOrThis());
}

// ======================================================== //
// ====                    LB TOKEN                    ==== //
// ======================================================== //

/**
 * @return The name of the token
 */
export function name(_: StaticArray<u8>): StaticArray<u8> {
  return stringToBytes('Liquidity Book Token');
}

/**
 * @return The symbol of the token
 */
export function symbol(_: StaticArray<u8>): StaticArray<u8> {
  return stringToBytes('LBT');
}

/**
 * Returns the total supply of token of type `id`
 * @dev This is the amount of token of type `id` minted minus the amount burned
 * @param bs the token id (serialized)
 */
export function totalSupply(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _id = args.nextU64().expect('_id is missing');

  const supply = getTotalSupply(_id);
  return u256ToBytes(supply);
}

/**
 * Returns the amount of tokens of type `id` owned by `_account`
 * @param _account The address of the owner
 * @param _id The token id
 * @return The amount of tokens of type `id` owned by `_account`
 */
export function balanceOf(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _account = new Address(args.nextString().expect('_account is missing'));
  const _id = args.nextU64().expect('_id is missing');

  const bal = getBalance(_id, _account);
  return u256ToBytes(bal);
}

/**
 * Return the balance of multiple (account/id) pairs
 * @param _accounts The addresses of the owners
 * @param _ids The token ids
 * @returns batchBalances The balance for each (account, id) pair
 */
export function balanceOfBatch(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _accounts = args
    .nextSerializableObjectArray<Address>()
    .expect('_accounts is missing');
  const _ids: u64[] = args.nextFixedSizeArray<u64>().expect('_ids is missing');

  checkLength(_accounts.length, _ids.length);
  const batchBalances: u256[] = [];

  // unsafe math is fine
  for (let i = 0; i < _accounts.length; ++i) {
    batchBalances[i] = getBalance(_ids[i], _accounts[i]);
  }

  return fixedSizeArrayToBytes(batchBalances);
}

/**
 * Returns true if `spender` is approved to transfer `_account`'s tokens
 * @param _owner The address of the owner
 * @param _spender The address of the spender
 * @returns True if `spender` is approved to transfer `_account`'s tokens
 */
export function isApprovedForAll(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const _owner = new Address(args.nextString().expect('_owner is missing'));
  const _spender = new Address(args.nextString().expect('_spender is missing'));

  const res = _isApprovedForAll(_owner, _spender);
  return boolToByte(res);
}

/**
 * Grants or revokes permission to `spender` to transfer the caller's tokens, according to `approved`
 * @param _spender The address of the spender
 * @param _approved The boolean value to grant or revoke permission
 */
export function setApprovalForAll(bs: StaticArray<u8>): void {
  const SCBalance = balance();
  const sent = transferredCoins();

  const args = new Args(bs);
  const _approved = args.nextBool().expect('_approved is missing');
  const _spender = new Address(args.nextString().expect('_spender is missing'));
  const caller = Context.caller();

  _setApprovalForAll(caller, _spender, _approved);

  transferRemaining(SCBalance, balance(), sent, Context.caller());
}

/**
 * Transfers `_amount` token of type `_id` from `_from` to `_to`
 * @param _from The address of the owner of the token
 * @param _to The address of the recipient
 * @param _id The token id
 * @param _amount The amount to send
 */
export function safeTransferFrom(bs: StaticArray<u8>): void {
  const SCBalance = balance();
  const sent = transferredCoins();

  const args = new Args(bs);
  const _from = new Address(args.nextString().expect('_from is missing'));
  const _to = new Address(args.nextString().expect('_to is missing'));
  const _id = args.nextU64().expect('_id is missing');
  const _amount = args.nextU256().expect('_amount is missing');

  const caller = Context.caller();
  checkAddresses(_from, _to);
  checkApproval(_from, caller);

  _transfer(_from, _to, _id, _amount);
  _addDepositedBins(_to, [_id]);
  _removeDepositedBins(_from, [_id]);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  generateTransferEvent(_from, _to, _id, _amount);
}

/**
 * Batch transfers `_amount` tokens of type `_id` from `_from` to `_to`
 * @param _from The address of the owner of the tokens
 * @param _to The address of the recipient
 * @param _ids The list of token ids
 * @param _amounts The list of amounts to send
 */
export function safeBatchTransferFrom(bs: StaticArray<u8>): void {
  const SCBalance = balance();
  const sent = transferredCoins();

  const args = new Args(bs);
  const _from = new Address(args.nextString().expect('_from is missing'));
  const _to = new Address(args.nextString().expect('_to is missing'));
  const _ids: u64[] = args.nextFixedSizeArray<u64>().expect('_ids is missing');
  const _amounts: u256[] = args
    .nextFixedSizeArray<u256>()
    .expect('_amounts is missing');

  const caller = Context.caller();
  checkLength(_ids.length, _amounts.length);
  checkAddresses(_from, _to);
  checkApproval(_from, caller);

  // unsafe math is fine
  let stringifyAmounts: string[] = [];

  for (let i = 0; i < _ids.length; ++i) {
    _transfer(_from, _to, _ids[i], _amounts[i]);
    stringifyAmounts.push(u256ToString(_amounts[i]));
  }

  _removeDepositedBins(_from, _ids);
  _addDepositedBins(_to, _ids);

  transferRemaining(SCBalance, balance(), sent, Context.caller());

  const argmnts: string[] = [
    caller.toString(),
    _from.toString(),
    _to.toString(),
    _ids.toString(),
    stringifyAmounts.join(DELIMITER),
  ];
  const event = createEvent('TransferBatch', argmnts);
  generateEvent(event);
}

// ======================================================== //
// ====              INTERNAL FUNCTIONS                ==== //
// ======================================================== //

/**
 * Internal function to add `_ids` to the list of deposited bins of `_from`
 * @param _user the address of the user
 * @param _ids the ids to add
 */
function _addDepositedBins(_user: Address, _ids: u64[]): void {
  if (_user.notEqual(Context.callee())) {
    const depositedBins = _getUserBins(_user);
    for (let i = 0; i < _ids.length; ++i) {
      const index = depositedBins.indexOf(_ids[i] as i32);
      if (index == -1) {
        depositedBins.push(_ids[i] as i32);
      }
    }
    DEPOSITED_BINS.set(_user.toString(), nativeTypeArrayToBytes(depositedBins));
  }
}

/**
 * Internal function to remove `_ids` from the list of deposited bins of `_from`
 * @dev The fees of _ids are collected too
 * @param _user the address of the user
 * @param _ids the ids to remove
 */
function _removeDepositedBins(_user: Address, _ids: u64[]): void {
  if (_user.notEqual(Context.callee())) {
    const depositedBins = _getUserBins(_user);
    for (let i = 0; i < _ids.length; ++i) {
      const index = depositedBins.indexOf(_ids[i] as i32);
      if (index != -1 && getBalance(_ids[i], _user).isZero()) {
        depositedBins.splice(index, 1);
      }
    }
    DEPOSITED_BINS.set(_user.toString(), nativeTypeArrayToBytes(depositedBins));
    _collectfees(_user, _ids);
  }
}

/**
 * Internal function to transfer `_amount` tokens of type `_id` from `_from` to `_to`
 * @param _from The address of the owner of the token
 * @param _to The address of the recipient
 * @param _id The token id
 * @param _amount The amount to send
 */
function _transfer(
  _from: Address,
  _to: Address,
  _id: u64,
  _amount: u256,
): void {
  const _fromBalance = getBalance(_id, _from);
  assert(
    _fromBalance >= _amount,
    LBToken__TransferExceedsBalance(_from, _id, _amount),
  );

  _beforeTokenTransfer(_from, _to, _id, _amount);

  // unsafe math is fine as we already checked the balance
  setBalance(_id, _from, u256.sub(_fromBalance, _amount));
  setBalance(_id, _to, u256.add(getBalance(_id, _to), _amount));
}

/**
 * @dev Creates `_amount` tokens of type `_id`, and assigns them to `_account`
 * @param _account The address of the recipient
 * @param _id The token id
 * @param _amount The amount to mint
 */
function _mint(_account: Address, _id: u64, _amount: u256): void {
  _beforeTokenTransfer(new Address('0'), _account, _id, _amount);

  setTotalSupply(_id, SafeMath256.add(getTotalSupply(_id), _amount));

  // unsafe math is fine as it would revert before
  setBalance(_id, _account, u256.add(getBalance(_id, _account), _amount));

  generateTransferEvent(new Address('0'), _account, _id, _amount);
}

/**
 * @dev Destroys `_amount` tokens of type `_id` from `_account`
 * @param _account The address of the owner
 * @param _id The token id
 * @param _amount The amount to destroy
 */
function _burn(_account: Address, _id: u64, _amount: u256): void {
  const _accountBalance = getBalance(_id, _account);
  assert(
    _accountBalance >= _amount,
    LBToken__BurnExceedsBalance(_account, _id, _amount),
  );

  _beforeTokenTransfer(_account, new Address('0'), _id, _amount);

  // unsafe math is fine as it would revert before
  setBalance(_id, _account, u256.sub(_accountBalance, _amount));
  setTotalSupply(_id, u256.sub(getTotalSupply(_id), _amount));

  generateTransferEvent(_account, new Address('0'), _id, _amount);
}

/**
 * Grants or revokes permission to `spender` to transfer the caller's tokens, according to `approved`
 * @param _owner The address of the owner
 * @param _spender The address of the spender
 * @param _approved The boolean value to grant or revoke permission
 */
function _setApprovalForAll(
  _owner: Address,
  _spender: Address,
  _approved: bool,
): void {
  assert(_owner.notEqual(_spender), LBToken__SelfApproval(_owner));

  setSpenderApprovals(_owner, _spender, _approved);

  const args: string[] = [
    _owner.toString(),
    _spender.toString(),
    _approved.toString(),
  ];

  const event = createEvent('ApprovalForAll', args);
  generateEvent(event);
}

/**
 * Returns true if `spender` is approved to transfer `owner`'s tokens
 * or if `sender` is the `owner`
 * @param _owner The address of the owner
 * @param _spender The address of the spender
 * @returns True if `spender` is approved to transfer `owner`'s tokens
 */
function _isApprovedForAll(_owner: Address, _spender: Address): bool {
  return _owner.equals(_spender) || getSpenderApprovals(_owner, _spender);
}

// ======================================================== //
// ====                    MODIFIERS                     ==== //
// ======================================================== //

function checkApproval(_from: Address, _spender: Address): void {
  assert(
    _isApprovedForAll(_from, _spender),
    LBToken__SpenderNotApproved(_from, _spender),
  );
}

function checkAddresses(_from: Address, _to: Address): void {
  assert(_from.notEqual(_to), LBToken__TransferToSelf());
}

function checkLength(_lengthA: u64, _lengthB: u64): void {
  assert(_lengthA == _lengthB, LBToken__LengthMismatch(_lengthA, _lengthB));
}

// ======================================================== //
// ====                    GETTERS                     ==== //
// ======================================================== //

/**
 * Returns whether `spender` is allowed to manage `id` tokens for `owner`
 * @dev PersistentMap from account to spender approvals
 */
function getSpenderApprovals(_owner: Address, _spender: Address): bool {
  const key = createKey([_owner.toString(), _spender.toString()]);
  return SPENDER_APPROVALS.get(key, false);
}

/**
 * Returns the balance of token of type `id` owned by `account`
 * @dev PersistentMap from token id to account balances
 */
function getBalance(_id: u64, _account: Address): u256 {
  const key = createKey([_id.toString(), _account.toString()]);
  return BALANCES.get(key, u256.Zero);
}

/**
 * Returns the total supply of token of type `id`
 * @dev PersistentMap from token id to total supplies
 */
function getTotalSupply(_id: u64): u256 {
  return TOTAL_SUPPLIES.get(_id, u256.Zero);
}

// ======================================================== //
// ====                    SETTERS                     ==== //
// ======================================================== //

/**
 * Set if the `spender` is allowed to manage `id` tokens for `owner`
 */
function setSpenderApprovals(
  _owner: Address,
  _spender: Address,
  approval: bool,
): void {
  const key = createKey([_owner.toString(), _spender.toString()]);
  SPENDER_APPROVALS.set(key, approval);
}

/**
 * Set the balance of token of type `id` owned by `account`
 */
function setBalance(_id: u64, _account: Address, balance: u256): void {
  const key = createKey([_id.toString(), _account.toString()]);
  BALANCES.set(key, balance);
}

/**
 * Set the total supply of token of type `id`
 */
function setTotalSupply(_id: u64, supply: u256): void {
  TOTAL_SUPPLIES.set(_id, supply);
}

// ======================================================== //
// ====                    HELPERS                     ==== //
// ======================================================== //

/**
 * @notice Function used by an SC to receive Massa coins
 * @param _ unused
 */
export function receiveCoins(_: StaticArray<u8>): void {}

function generateTransferEvent(
  _from: Address,
  _to: Address,
  _id: u64,
  _amount: u256,
): void {
  const event = createEvent('TransferSingle', [
    Context.caller().toString(),
    _from.toString(),
    _to.toString(),
    _id.toString(),
    u256ToString(_amount),
  ]);
  generateEvent(event);
}
