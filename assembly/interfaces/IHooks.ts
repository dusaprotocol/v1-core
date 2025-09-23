import { u256 } from 'as-bignum/assembly/integer/u256';
import { HooksParameters } from '../libraries/Hooks';
import { IPair } from './IPair';
import { Address, call, Storage } from '@massalabs/massa-as-sdk';
import { PAIR } from '../contracts/BaseHooks';
import { Args } from '@massalabs/as-types';

export class IHooks {
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
   * @param {Address} pair - The pair associated to this hook
   */
  init(pair: Address, masToSend: u64): void {
    const args = new Args().add(pair);
    call(this._origin, 'constructor', args, masToSend);
  }

  getPair(): IPair {
    return new IPair(new Address(Storage.getOf(this._origin, PAIR)));
  }

  isLinked(): bool {
    const hooksParameters = this.getPair().getHooksParameters();
    return hooksParameters.hooks.equals(this._origin);
  }

  onHooksSet(
    hooksParameters: HooksParameters,
    onHooksSetData: StaticArray<u8>,
  ): void {
    const args = new Args().add(hooksParameters).add(onHooksSetData);
    call(this._origin, 'onHooksSet', args, 0);
  }

  beforeSwap(
    sender: Address,
    to: Address,
    swapForY: bool,
    amountIn: u256,
  ): void {
    const args = new Args().add(sender).add(to).add(swapForY).add(amountIn);
    call(this._origin, 'beforeSwap', args, 0);
  }

  afterSwap(
    sender: Address,
    to: Address,
    swapForY: bool,
    amountOut: u256,
  ): void {
    const args = new Args().add(sender).add(to).add(swapForY).add(amountOut);
    call(this._origin, 'afterSwap', args, 0);
  }

  beforeFlashLoan(sender: Address, to: Address, amount: u256): void {
    const args = new Args().add(sender).add(to).add(amount);
    call(this._origin, 'beforeFlashLoan', args, 0);
  }

  afterFlashLoan(
    sender: Address,
    to: Address,
    fees: u256,
    feesReceived: u256,
  ): void {
    const args = new Args().add(sender).add(to).add(fees).add(feesReceived);
    call(this._origin, 'afterFlashLoan', args, 0);
  }

  beforeMint(
    sender: Address,
    to: Address,
    ids: Array<u64>,
    distributionX: Array<u256>,
    distributionY: Array<u256>,
    amountsReceived: Array<u256>,
  ): void {
    const args = new Args()
      .add(sender)
      .add(to)
      .add(ids)
      .add(distributionX)
      .add(distributionY)
      .add(amountsReceived);
    call(this._origin, 'beforeMint', args, 0);
  }

  afterMint(
    sender: Address,
    to: Address,
    ids: Array<u64>,
    distributionX: Array<u256>,
    distributionY: Array<u256>,
    amountsIn: Array<u256>,
  ): void {
    const args = new Args()
      .add(sender)
      .add(to)
      .add(ids)
      .add(distributionX)
      .add(distributionY)
      .add(amountsIn);
    call(this._origin, 'afterMint', args, 0);
  }

  beforeBurn(
    sender: Address,
    to: Address,
    ids: Array<u64>,
    amountsToBurn: Array<u256>,
  ): void {
    const args = new Args().add(sender).add(to).add(ids).add(amountsToBurn);
    call(this._origin, 'beforeBurn', args, 0);
  }

  afterBurn(
    sender: Address,
    to: Address,
    ids: Array<u64>,
    amountsToBurn: Array<u256>,
  ): void {
    const args = new Args().add(sender).add(to).add(ids).add(amountsToBurn);
    call(this._origin, 'afterBurn', args, 0);
  }

  beforeBatchTransferFrom(
    sender: Address,
    from: Address,
    to: Address,
    ids: Array<u64>,
    amounts: Array<u256>,
  ): void {
    const args = new Args().add(sender).add(from).add(to).add(ids).add(amounts);
    call(this._origin, 'beforeBatchTransferFrom', args, 0);
  }

  afterBatchTransferFrom(
    sender: Address,
    from: Address,
    to: Address,
    ids: Array<u64>,
    amounts: Array<u256>,
  ): void {
    const args = new Args().add(sender).add(from).add(to).add(ids).add(amounts);
    call(this._origin, 'afterBatchTransferFrom', args, 0);
  }
}
