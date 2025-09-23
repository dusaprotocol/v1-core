import { Args, Result, Serializable } from '@massalabs/as-types';
import { Address, call } from '@massalabs/massa-as-sdk';
import { u256 } from 'as-bignum/assembly/integer/u256';
import { ZERO_ADDRESS } from './Constants';

// Define flag bit masks
export const BEFORE_SWAP_FLAG: u32 = 1 << 0;
export const AFTER_SWAP_FLAG: u32 = 1 << 1;
export const BEFORE_FLASH_LOAN_FLAG: u32 = 1 << 2;
export const AFTER_FLASH_LOAN_FLAG: u32 = 1 << 3;
export const BEFORE_MINT_FLAG: u32 = 1 << 4;
export const AFTER_MINT_FLAG: u32 = 1 << 5;
export const BEFORE_BURN_FLAG: u32 = 1 << 6;
export const AFTER_BURN_FLAG: u32 = 1 << 7;
export const BEFORE_TRANSFER_FLAG: u32 = 1 << 8;
export const AFTER_TRANSFER_FLAG: u32 = 1 << 9;

export class HooksParameters implements Serializable {
  constructor(
    public hooks: Address = new Address(),
    public flags: u32 = 0,
  ) {}

  serialize(): StaticArray<u8> {
    return new Args().add(this.hooks).add(this.flags).serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.hooks = new Address(
      args.nextString().expect('Failed to deserialize hooks'),
    );
    this.flags = args.nextU32().expect('Failed to deserialize flags');
    return new Result(args.offset);
  }
}

/// @notice Helper contract used for Hooks
export class Hooks {
  /**
   * Returns a new encoded parameter with the hooks address replaced.
   */
  static setHooks(
    encoded: HooksParameters,
    newHooks: Address,
  ): HooksParameters {
    let newEncoded = new HooksParameters();
    newEncoded.hooks = newHooks;
    newEncoded.flags = encoded.flags;
    return newEncoded;
  }

  /**
   * Returns the flags stored in the encoded parameters.
   */
  static getFlags(encoded: HooksParameters): u32 {
    return encoded.flags;
  }

  /**
   * Helper function call the hook contract.
   */
  static _safeCall(encoded: HooksParameters, method: string, args: Args): void {
    call(encoded.hooks, method, args, 0);
  }

  // ─── HOOKS CALLING FUNCTIONS ────────────────────────────────────────────────

  /**
   * Calls the onHooksSet hook on the hooks contract if the hooks address is set.
   */
  static onHooksSet(
    encoded: HooksParameters,
    onHooksSetData: StaticArray<u8>,
  ): void {
    if (encoded.hooks != ZERO_ADDRESS) {
      this._safeCall(
        encoded,
        'onHooksSet',
        new Args().add(encoded).add(onHooksSetData),
      );
    }
  }

  /**
   * Calls beforeSwap on the hooks contract if the BEFORE_SWAP_FLAG is set.
   */
  static beforeSwap(
    encoded: HooksParameters,
    sender: Address,
    to: Address,
    swapForY: bool,
    amountIn: u256,
  ): void {
    if ((encoded.flags & BEFORE_SWAP_FLAG) != 0) {
      this._safeCall(
        encoded,
        'beforeSwap',
        new Args().add(sender).add(to).add(swapForY).add(amountIn),
      );
    }
  }

  /**
   * Calls afterSwap on the hooks contract if the AFTER_SWAP_FLAG is set.
   */
  static afterSwap(
    encoded: HooksParameters,
    sender: Address,
    to: Address,
    swapForY: bool,
    amountOut: u256,
  ): void {
    if ((encoded.flags & AFTER_SWAP_FLAG) != 0) {
      this._safeCall(
        encoded,
        'afterSwap',
        new Args().add(sender).add(to).add(swapForY).add(amountOut),
      );
    }
  }

  /**
   * Calls beforeFlashLoan on the hooks contract if the BEFORE_FLASH_LOAN_FLAG is set.
   */
  static beforeFlashLoan(
    encoded: HooksParameters,
    sender: Address,
    to: Address,
    amount: u256,
  ): void {
    if ((encoded.flags & BEFORE_FLASH_LOAN_FLAG) != 0) {
      this._safeCall(
        encoded,
        'beforeFlashLoan',
        new Args().add(sender).add(to).add(amount),
      );
    }
  }

  /**
   * Calls afterFlashLoan on the hooks contract if the AFTER_FLASH_LOAN_FLAG is set.
   */
  static afterFlashLoan(
    encoded: HooksParameters,
    sender: Address,
    to: Address,
    fees: u256,
    feesReceived: u256,
  ): void {
    if ((encoded.flags & AFTER_FLASH_LOAN_FLAG) != 0) {
      this._safeCall(
        encoded,
        'afterFlashLoan',
        new Args().add(sender).add(to).add(fees).add(feesReceived),
      );
    }
  }

  /**
   * Calls beforeMint on the hooks contract if the BEFORE_MINT_FLAG is set.
   */
  static beforeMint(
    encoded: HooksParameters,
    sender: Address,
    to: Address,
    ids: Array<u64>,
    distributionX: Array<u256>,
    distributionY: Array<u256>,
    amountsReceived: Array<u256>,
  ): void {
    if ((encoded.flags & BEFORE_MINT_FLAG) != 0) {
      this._safeCall(
        encoded,
        'beforeMint',
        new Args()
          .add(sender)
          .add(to)
          .add(ids)
          .add(distributionX)
          .add(distributionY)
          .add(amountsReceived),
      );
    }
  }

  /**
   * Calls afterMint on the hooks contract if the AFTER_MINT_FLAG is set.
   */
  static afterMint(
    encoded: HooksParameters,
    sender: Address,
    to: Address,
    ids: Array<u64>,
    distributionX: Array<u256>,
    distributionY: Array<u256>,
    amountsIn: Array<u256>,
  ): void {
    if ((encoded.flags & AFTER_MINT_FLAG) != 0) {
      this._safeCall(
        encoded,
        'afterMint',
        new Args()
          .add(sender)
          .add(to)
          .add(ids)
          .add(distributionX)
          .add(distributionY)
          .add(amountsIn),
      );
    }
  }

  /**
   * Calls beforeBurn on the hooks contract if the BEFORE_BURN_FLAG is set.
   */
  static beforeBurn(
    encoded: HooksParameters,
    sender: Address,
    to: Address,
    ids: Array<u64>,
    amountsToBurn: Array<u256>,
  ): void {
    if ((encoded.flags & BEFORE_BURN_FLAG) != 0) {
      this._safeCall(
        encoded,
        'beforeBurn',
        new Args().add(sender).add(to).add(ids).add(amountsToBurn),
      );
    }
  }

  /**
   * Calls afterBurn on the hooks contract if the AFTER_BURN_FLAG is set.
   */
  static afterBurn(
    encoded: HooksParameters,
    sender: Address,
    to: Address,
    ids: Array<u64>,
    amountsToBurn: Array<u256>,
  ): void {
    if ((encoded.flags & AFTER_BURN_FLAG) != 0) {
      this._safeCall(
        encoded,
        'afterBurn',
        new Args().add(sender).add(to).add(ids).add(amountsToBurn),
      );
    }
  }

  /**
   * Calls beforeBatchTransferFrom on the hooks contract if the BEFORE_TRANSFER_FLAG is set.
   */
  static beforeBatchTransferFrom(
    encoded: HooksParameters,
    sender: Address,
    from: Address,
    to: Address,
    ids: Array<u64>,
    amounts: Array<u256>,
  ): void {
    if ((encoded.flags & BEFORE_TRANSFER_FLAG) != 0) {
      this._safeCall(
        encoded,
        'beforeBatchTransferFrom',
        new Args().add(sender).add(from).add(to).add(ids).add(amounts),
      );
    }
  }

  /**
   * Calls afterBatchTransferFrom on the hooks contract if the AFTER_TRANSFER_FLAG is set.
   */
  static afterBatchTransferFrom(
    encoded: HooksParameters,
    sender: Address,
    from: Address,
    to: Address,
    ids: Array<u64>,
    amounts: Array<u256>,
  ): void {
    if ((encoded.flags & AFTER_TRANSFER_FLAG) != 0) {
      this._safeCall(
        encoded,
        'afterBatchTransferFrom',
        new Args().add(sender).add(from).add(to).add(ids).add(amounts),
      );
    }
  }
}
