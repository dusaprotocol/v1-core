import { Args, byteToBool } from '@massalabs/as-types';
import { Address, call } from '@massalabs/massa-as-sdk';
import { IERC20 } from './IERC20';
import { u256 } from 'as-bignum/assembly/integer/u256';

export class IFlashLoanCallback {
  _origin: Address;

  /**
   * Wraps a smart contract exposing standard token FFI.
   *
   * @param {Address} at - Address of the smart contract.
   */
  constructor(at: Address) {
    this._origin = at;
  }

  flashLoanCallback(
    sender: Address,
    token: IERC20,
    amount: u256,
    fee: u256,
  ): bool {
    const args = new Args().add(sender).add(token).add(amount).add(fee);
    return byteToBool(call(this._origin, 'flashLoanCallback', args, 0));
  }
}
