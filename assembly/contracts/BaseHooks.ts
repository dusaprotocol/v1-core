import {
  Address,
  callerHasWriteAccess,
  Context,
  Storage,
} from '@massalabs/massa-as-sdk';
import { IPair } from '../interfaces';
import { Args } from '@massalabs/as-types';
import { HooksParameters } from '../libraries/Hooks';
import { u256 } from 'as-bignum/assembly/integer/u256';

export const PAIR = 'PAIR';

// ======================================================== //
// ====                  CONSTRUCTOR                   ==== //
// ======================================================== //

export function constructor(bs: StaticArray<u8>): void {
  assert(callerHasWriteAccess(), 'constructor can only be called once');

  const args = new Args(bs);
  const _pair = new Address(args.nextString().expect('_pair is missing'));

  Storage.set(PAIR, _pair.toString());
}

// ======================================================== //
// ====        EXPORTED FUNCTION - DO NOT EDIT         ==== //
// ======================================================== //

export function onHooksSet(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const hooksParameters = args
    .nextSerializable<HooksParameters>()
    .expect('hooksParameters is missing');
  const onHooksSetData: StaticArray<u8> = args
    .nextBytes()
    .expect('onHooksSetData is missing');

  _checkTrustedCaller();
  assert(_isLinked(), 'BaseHooksNotLinked');
  _onHooksSet(hooksParameters, onHooksSetData);
}

export function beforeSwap(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const swapForY = args.nextBool().expect('swapForY is missing');
  const amountIn = args.nextU256().expect('amountIn is missing');

  _checkTrustedCaller();
  _beforeSwap(sender, to, swapForY, amountIn);
}

export function afterSwap(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const swapForY = args.nextBool().expect('swapForY is missing');
  const amountOut = args.nextU256().expect('amountOut is missing');

  _checkTrustedCaller();
  _afterSwap(sender, to, swapForY, amountOut);
}

export function beforeFlashLoan(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const amount = args.nextU256().expect('amount is missing');

  _checkTrustedCaller();
  _beforeFlashLoan(sender, to, amount);
}

export function afterFlashLoan(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const fees = args.nextU256().expect('fees is missing');
  const feesReceived = args.nextU256().expect('feesReceived is missing');

  _checkTrustedCaller();
  _afterFlashLoan(sender, to, fees, feesReceived);
}

export function beforeMint(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const ids = args.nextFixedSizeArray<u64>().expect('ids is missing');
  const distributionX = args
    .nextFixedSizeArray<u256>()
    .expect('distributionX is missing');
  const distributionY = args
    .nextFixedSizeArray<u256>()
    .expect('distributionY is missing');
  const amountsReceived = args
    .nextFixedSizeArray<u256>()
    .expect('amountsReceived is missing');

  _checkTrustedCaller();
  _beforeMint(sender, to, ids, distributionX, distributionY, amountsReceived);
}

export function afterMint(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const ids = args.nextFixedSizeArray<u64>().expect('ids is missing');
  const distributionX = args
    .nextFixedSizeArray<u256>()
    .expect('distributionX is missing');
  const distributionY = args
    .nextFixedSizeArray<u256>()
    .expect('distributionY is missing');
  const amountsIn = args
    .nextFixedSizeArray<u256>()
    .expect('amountsIn is missing');

  _checkTrustedCaller();
  _afterMint(sender, to, ids, distributionX, distributionY, amountsIn);
}

export function beforeBurn(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const ids = args.nextFixedSizeArray<u64>().expect('ids is missing');
  const amountsToBurn = args
    .nextFixedSizeArray<u256>()
    .expect('amountsToBurn is missing');

  _checkTrustedCaller();
  _beforeBurn(sender, to, ids, amountsToBurn);
}

export function afterBurn(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const ids = args.nextFixedSizeArray<u64>().expect('ids is missing');
  const amountsToBurn = args
    .nextFixedSizeArray<u256>()
    .expect('amountsToBurn is missing');

  _checkTrustedCaller();
  _afterBurn(sender, to, ids, amountsToBurn);
}

export function beforeBatchTransferFrom(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const from = new Address(args.nextString().expect('from is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const ids = args.nextFixedSizeArray<u64>().expect('ids is missing');
  const amounts = args.nextFixedSizeArray<u256>().expect('amounts is missing');

  _checkTrustedCaller();
  _beforeBatchTransferFrom(sender, from, to, ids, amounts);
}

export function afterBatchTransferFrom(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const sender = new Address(args.nextString().expect('sender is missing'));
  const from = new Address(args.nextString().expect('from is missing'));
  const to = new Address(args.nextString().expect('to is missing'));
  const ids = args.nextFixedSizeArray<u64>().expect('ids is missing');
  const amounts = args.nextFixedSizeArray<u256>().expect('amounts is missing');

  _checkTrustedCaller();
  _afterBatchTransferFrom(sender, from, to, ids, amounts);
}

// ======================================================== //
// ====                HELPER FUNCTIONS                ==== //
// ======================================================== //

/**
 * Ensures that the caller is the trusted Pair.
 */
function _checkTrustedCaller(): void {
  assert(Context.caller() == _getPair()._origin, 'BaseHooksInvalidCaller');
}

/**
 * Checks if the contract is correctly linked to the Pair.
 */
function _isLinked(): bool {
  const hooksParameters = _getPair().getHooksParameters();
  return hooksParameters.hooks.equals(Context.callee());
}

/**
 * Returns the Pair contract.
 * This abstract function must be implemented by the inheriting contract.
 */
function _getPair(): IPair {
  return new IPair(new Address(Storage.get(PAIR)));
}

// ======================================================== //
// ====              HOOK IMPLEMENTATIONS              ==== //
// ======================================================== //
//
// Internal hook implementations
// (empty by default, meant to be changed)

function _onHooksSet(
  hooksParameters: HooksParameters,
  onHooksSetData: StaticArray<u8>,
): void {}
function _beforeSwap(
  sender: Address,
  to: Address,
  swapForY: bool,
  amountIn: u256,
): void {}
function _afterSwap(
  sender: Address,
  to: Address,
  swapForY: bool,
  amountOut: u256,
): void {}
function _beforeFlashLoan(sender: Address, to: Address, amount: u256): void {}
function _afterFlashLoan(
  sender: Address,
  to: Address,
  fees: u256,
  feesReceived: u256,
): void {}
function _beforeMint(
  sender: Address,
  to: Address,
  ids: Array<u64>,
  distributionX: Array<u256>,
  distributionY: Array<u256>,
  amountsReceived: Array<u256>,
): void {}
function _afterMint(
  sender: Address,
  to: Address,
  ids: Array<u64>,
  distributionX: Array<u256>,
  distributionY: Array<u256>,
  amountsIn: Array<u256>,
): void {}
function _beforeBurn(
  sender: Address,
  to: Address,
  ids: Array<u64>,
  amountsToBurn: Array<u256>,
): void {}
function _afterBurn(
  sender: Address,
  to: Address,
  ids: Array<u64>,
  amountsToBurn: Array<u256>,
): void {}
function _beforeBatchTransferFrom(
  sender: Address,
  from: Address,
  to: Address,
  ids: Array<u64>,
  amounts: Array<u256>,
): void {}
function _afterBatchTransferFrom(
  sender: Address,
  from: Address,
  to: Address,
  ids: Array<u64>,
  amounts: Array<u256>,
): void {}
