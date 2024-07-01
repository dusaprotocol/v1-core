import {
  Args,
  bytesToFixedSizeArray,
  bytesToString,
  bytesToU256,
  byteToBool,
  Result,
} from '@massalabs/as-types';
import { Address, call, Storage } from '@massalabs/massa-as-sdk';
import { FEES_PARAMETERS, TOKEN_X, TOKEN_Y, FACTORY } from '../storage/Pair';
import {
  Bin,
  FeeParameters,
  PairInformation,
  Preset,
  OracleParameters,
} from '../structs';
import { IERC20 } from './IERC20';
import { Amounts, MintReturn, OracleSampleReturn } from '../structs/Returns';
import { u256 } from 'as-bignum/assembly/integer/u256';

export class IPair {
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
   * Calls the constructor
   *
   * @param {Address} factory -
   */
  init(
    factory: Address,
    tokenX: Address,
    tokenY: Address,
    activeId: u32,
    preset: Preset,
    masToSend: u64,
  ): void {
    const args = new Args()
      .add(factory)
      .add(tokenX)
      .add(tokenY)
      .add(activeId)
      .add(preset.sampleLifetime)
      .add(
        new FeeParameters(
          preset.binStep,
          preset.baseFactor,
          preset.filterPeriod,
          preset.decayPeriod,
          preset.reductionFactor,
          preset.variableFeeControl,
          preset.protocolShare,
          preset.maxVolatilityAccumulated,
        ),
      );
    call(this._origin, 'constructor', args, masToSend);
  }

  /**
   * Get the fees parameters for this pair
   *
   */
  feeParameters(): FeeParameters {
    const bs = Storage.getOf(this._origin, FEES_PARAMETERS);
    return new Args(bs).nextSerializable<FeeParameters>().unwrap();
  }

  /**
   * Get the bin information for a given id
   *
   * @param {u32} _id - The id of the bin
   *
   */
  getBin(_id: u32): Bin {
    const bs = call(this._origin, 'getBin', new Args().add(_id), 0);
    return new Args(bs).nextSerializable<Bin>().unwrap();
  }

  /**
   * Swap tokens iterating over the bins until the entire amount is swapped.
   * Will swap token X for token Y if `_swapForY` is true, and token Y for token X if `_swapForY` is false.
   * This function will not transfer the tokens from the caller, it is expected that the tokens have already been
   * transferred to this contract through another contract.
   * That is why this function shouldn't be called directly, but through one of the swap functions of the router
   * that will also perform safety checks.
   *
   * @param {bool} swapForY - Whether you've swapping token X for token Y (true) or token Y for token X (false)
   * @param {Address} to - The address to send the tokens to
   * @param masToSend The amount of Massa to send for storage
   *
   */
  swap(swapForY: bool, to: Address, masToSend: u64): u256 {
    const args = new Args().add(swapForY).add(to);
    const res = call(this._origin, 'swap', args, masToSend);
    return bytesToU256(res);
  }

  /**
   * Mint new LB tokens for each bins where the user adds liquidity.
   * This function will not transfer the tokens from the caller, it is expected that the tokens have already been
   * transferred to this contract through another contract.
   * That is why this function shouldn't be called directly, but through one of the add liquidity functions of the
   * router that will also perform safety checks.
   * Any excess amount of token will be sent to the `to` address. The lengths of the arrays must be the same.
   *
   * @param {Array<u64>} _ids - The ids of the bins where the liquidity will be added. It will mint LB tokens for each of these bins.
   * @param {Array<u256>} _distributionX - The percentage of token X to add to each bin. The sum of all the values must not exceed 100%, that is 1e9.
   * @param {Array<u256>} _distributionY - The percentage of token Y to add to each bin. The sum of all the values must not exceed 100%, that is 1e9.
   * @param {Address} _to - The address that will receive the LB tokens and the excess amount of tokens.
   * @param {u64} masToSend - The amount of Massa to send for storage.
   * @returns {MintReturn} - The amount of token X and token Y that the user will receive and the amounts of LB tokens minted for each bin.

 
   *
   */
  mint(
    _ids: u64[],
    _distributionX: u256[],
    _distributionY: u256[],
    _to: Address,
    masToSend: u64,
  ): MintReturn {
    const args = new Args()
      .add(_ids)
      .add(_distributionX)
      .add(_distributionY)
      .add(_to);
    const res = new Args(call(this._origin, 'mint', args, masToSend));
    return new MintReturn(
      res.nextU256().unwrap(),
      res.nextU256().unwrap(),
      res.nextFixedSizeArray<u256>().unwrap(),
    );
  }

  /**
   * Burn LB tokens for each bins where the user removes liquidity.
   * This function will not transfer the LBToken from the caller, it is expected that the tokens have already been
   * transferred to this contract through another contract.
   * That is why this function shouldn't be called directly, but through one of the remove liquidity functions of the
   * router that will also perform safety checks.
   * The lengths of the arrays must be the same.
   *
   * @param {Array<u64>} _ids - The ids of the bins where the liquidity will be removed. It will burn LB tokens for each of these bins.
   * @param {Array<u256>} _amounts - The amount of LB tokens to burn for each bin.
   * @param {Address} _to - The address that will receive the tokens.
   * @param {u64} masToSend - The amount of Massa to send for storage
   * @returns {Amounts} - The amount of token X and token Y that the user will receive.
   *
   */
  burn(_ids: u64[], _amounts: u256[], _to: Address, masToSend: u64): Amounts {
    const args = new Args().add(_ids).add(_amounts).add(_to);
    const res = new Args(call(this._origin, 'burn', args, masToSend));
    return new Amounts(res.nextU256().unwrap(), res.nextU256().unwrap());
  }

  /**
   * Execute a flash loan.
   * The caller must implement the `IFlashLoanCallback` interface and have the `flashLoanCallback` function.
   * The `flashLoanCallback` function will be called by the pair contract to execute the logic of the flash loan.
   * The caller must return `true` if the flash loan was successful, and `false` otherwise.
   * The caller is expected to transfer the `amount + fee` of the token to this contract.
   *
   * @param {IERC20} token - The token to flash loan
   * @param {u256} amount - The amount of tokens to flash loan
   * @param masToSend The amount of Massa to send for storage
   *
   */
  flashLoan(token: IERC20, amount: u256, masToSend: u64): void {
    const args = new Args().add(token).add(amount);
    call(this._origin, 'flashLoan', args, masToSend);
  }

  getTokenX(): IERC20 {
    return new IERC20(new Address(Storage.getOf(this._origin, TOKEN_X)));
  }

  getTokenY(): IERC20 {
    return new IERC20(new Address(Storage.getOf(this._origin, TOKEN_Y)));
  }

  getPairInformation(): PairInformation {
    const res = call(this._origin, 'getPairInformation', new Args(), 0);
    return new Args(res).nextSerializable<PairInformation>().unwrap();
  }

  getUserBins(account: Address): u32[] {
    const res = call(this._origin, 'getUserBins', new Args().add(account), 0);
    return new Args(res).nextFixedSizeArray<u32>().unwrap();
  }

  findFirstNonEmptyBinId(id: u32, sentTokenY: bool): Result<u32> {
    const res = new Args(
      call(
        this._origin,
        'findFirstNonEmptyBinId',
        new Args().add(id).add(sentTokenY),
        0,
      ),
    );

    const val = res.nextU32();
    const msg = res.nextString();
    return new Result(val.unwrap(), msg.isOk() ? msg.unwrap() : null);
  }

  getFactory(): Address {
    return new Address(Storage.getOf(this._origin, FACTORY));
  }

  setFeesParameters(fp: FeeParameters): void {
    const args = new Args().add(fp);
    call(this._origin, 'setFeesParameter', args, 0);
  }

  forceDecay(): void {
    call(this._origin, 'forceDecay', new Args(), 0);
  }

  name(): string {
    const res = call(this._origin, 'name', new Args(), 0);
    return bytesToString(res);
  }

  symbol(): string {
    const res = call(this._origin, 'symbol', new Args(), 0);
    return bytesToString(res);
  }

  totalSupply(_id: u64): u256 {
    const res = call(this._origin, 'totalSupply', new Args().add(_id), 0);
    return bytesToU256(res);
  }

  balanceOf(_account: Address, _id: u64): u256 {
    const res = call(
      this._origin,
      'balanceOf',
      new Args().add(_account).add(_id),
      0,
    );
    return bytesToU256(res);
  }

  balanceOfBatch(_accounts: Address[], _ids: u64[]): u256[] {
    const args = new Args().addSerializableObjectArray(_accounts).add(_ids);
    return bytesToFixedSizeArray<u256>(
      call(this._origin, 'balanceOfBatch', args, 0),
    );
  }

  isApprovedForAll(_owner: Address, _spender: Address): bool {
    const res = call(
      this._origin,
      'isApprovedForAll',
      new Args().add(_owner).add(_spender),
      0,
    );
    return byteToBool(res);
  }

  /**
   * Grants or revokes permission to `spender` to transfer the caller's tokens, according to `approved`
   * @param _spender The address of the spender
   * @param _approved The boolean value to grant or revoke permission
   * @param masToSend The amount of Massa to send for storage
   */
  setApprovalForAll(_approved: bool, _sender: Address, masToSend: u64): void {
    call(
      this._origin,
      'setApprovalForAll',
      new Args().add(_approved).add(_sender),
      masToSend,
    );
  }

  /**
   * Transfers `_amount` token of type `_id` from `_from` to `_to`
   * @param _from The address of the owner of the token
   * @param _to The address of the recipient
   * @param _id The token id
   * @param _amount The amount to send
   * @param masToSend The amount of Massa to send for storage
   */
  safeTransferFrom(
    _from: Address,
    _to: Address,
    _id: u64,
    amount: u256,
    masToSend: u64,
  ): void {
    call(
      this._origin,
      'safeTransferFrom',
      new Args().add(_from).add(_to).add(_id).add(amount),
      masToSend,
    );
  }

  /**
   * Batch transfers `_amount` tokens of type `_id` from `_from` to `_to`
   * @param _from The address of the owner of the tokens
   * @param _to The address of the recipient
   * @param _ids The list of token ids
   * @param _amounts The list of amounts to send
   * @param masToSend The amount of Massa to send for storage
   */
  safeBatchTransferFrom(
    _from: Address,
    _to: Address,
    _ids: u64[],
    _amounts: u256[],
    masToSend: u64,
  ): void {
    const args = new Args().add(_from).add(_to).add(_ids).add(_amounts);
    call(this._origin, 'safeBatchTransferFrom', args, masToSend);
  }

  pendingFees(account: Address, ids: u64[]): Amounts {
    const args = new Args().add(account).add(ids);
    const res = new Args(call(this._origin, 'pendingFees', args, 0));
    return new Amounts(res.nextU256().unwrap(), res.nextU256().unwrap());
  }

  /**
   * Collect the fees accumulated by a user.
   * @param _account The address of the user
   * @param _ids The ids of the bins for which to collect the fees
   * @param masToSend The amount of Massa to send for storage
   * @return amountX The amount of token X collected and sent to `_account`
   * @return amountY The amount of token Y collected and sent to `_account`
   */
  collectFees(account: Address, ids: u64[], masToSend: u64): Amounts {
    const args = new Args().add(account).add(ids);
    const res = new Args(call(this._origin, 'collectFees', args, masToSend));
    return new Amounts(res.nextU256().unwrap(), res.nextU256().unwrap());
  }

  getOracleParameters(): OracleParameters {
    const res = call(this._origin, 'getOracleParameters', new Args(), 0);
    return new Args(res).nextSerializable<OracleParameters>().unwrap();
  }

  getOracleSampleFrom(timeDelta: u64): OracleSampleReturn {
    const res = new Args(
      call(this._origin, 'getOracleSampleFrom', new Args().add(timeDelta), 0),
    );
    return new OracleSampleReturn(
      res.nextU64().unwrap(),
      res.nextU64().unwrap(),
      res.nextU64().unwrap(),
    );
  }

  /**
   * Increases the length of the oracle to the given `_newLength` by adding empty samples to the end of the oracle.
   * The samples are however initialized to reduce the gas cost of the updates during a swap.
   * @param _newLength The new length of the oracle
   * @param masToSend The amount of Massa to send for storage
   */
  increaseOracleLength(newSize: u64, masToSend: u64): void {
    call(
      this._origin,
      'increaseOracleLength',
      new Args().add(newSize),
      masToSend,
    );
  }
}
