import { Args, Result, Serializable } from '@massalabs/as-types';
import { Address } from '@massalabs/massa-as-sdk';
import { IERC20 } from '../interfaces/IERC20';
import { u256 } from 'as-bignum/assembly/integer/u256';

/// The liquidity parameters, such as:
export class LiquidityParameters implements Serializable {
  /**
   * @param {IERC20} tokenX - The address of token X
   * @param {IERC20} tokenY - The address of token Y
   * @param {u64} binStep - The bin step of the pair
   * @param {u256} amountX - The amount to send of token X
   * @param {u256} amountY - The amount to send of token Y
   * @param {u256} amountXMin - The min amount of token X added to liquidity
   * @param {u256} amountYMin - The min amount of token Y added to liquidity
   * @param {u64} activeIdDesired - The active id that user wants to add liquidity from
   * @param {u64} idSlippage - The number of id that are allowed to slip
   * @param {Array<i64>} deltaIds - The list of delta ids to add liquidity (`deltaId = activeId - desiredId`)
   * @param {Array<u256>} distributionX - The distribution of tokenX with sum(distributionX) = 1e18 (100%) or 0 (0%)
   * @param {Array<u256>} distributionY - The distribution of tokenY with sum(distributionY) = 1e18 (100%) or 0 (0%)
   * @param {Address} to - The address of the recipient
   * @param {u64} deadline - The deadline of the tx
   */
  constructor(
    public tokenX: IERC20 = new IERC20(new Address('')),
    public tokenY: IERC20 = new IERC20(new Address('')),
    public binStep: u64 = 0,
    public amountX: u256 = u256.Zero,
    public amountY: u256 = u256.Zero,
    public amountXMin: u256 = u256.Zero,
    public amountYMin: u256 = u256.Zero,
    public activeIdDesired: u64 = 0,
    public idSlippage: u64 = 0,
    public deltaIds: Array<i64> = [],
    public distributionX: Array<u256> = [],
    public distributionY: Array<u256> = [],
    public to: Address = new Address(''),
    public deadline: u64 = 0,
  ) {}

  // ======================================================== //
  // ====                  SERIALIZATION                 ==== //
  // ======================================================== //

  serialize(): StaticArray<u8> {
    return new Args()
      .add(this.tokenX._origin)
      .add(this.tokenY._origin)
      .add(this.binStep)
      .add(this.amountX)
      .add(this.amountY)
      .add(this.amountXMin)
      .add(this.amountYMin)
      .add(this.activeIdDesired)
      .add(this.idSlippage)
      .add(this.deltaIds)
      .add(this.distributionX)
      .add(this.distributionY)
      .add(this.to)
      .add(this.deadline)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.tokenX = new IERC20(
      new Address(args.nextString().expect('Failed to deserialize tokenX')),
    );
    this.tokenY = new IERC20(
      new Address(args.nextString().expect('Failed to deserialize tokenY')),
    );
    this.binStep = args.nextU64().expect('Failed to deserialize binStep');
    this.amountX = args.nextU256().expect('Failed to deserialize amountX');
    this.amountY = args.nextU256().expect('Failed to deserialize amountY');
    this.amountXMin = args
      .nextU256()
      .expect('Failed to deserialize amountXMin');
    this.amountYMin = args
      .nextU256()
      .expect('Failed to deserialize amountYMin');
    this.activeIdDesired = args
      .nextU64()
      .expect('Failed to deserialize activeIdDesired');
    this.idSlippage = args.nextU64().expect('Failed to deserialize idSlippage');
    this.deltaIds = args
      .nextFixedSizeArray<i64>()
      .expect('Failed to deserialize deltaIds');
    this.distributionX = args
      .nextFixedSizeArray<u256>()
      .expect('Failed to deserialize distributionX');
    this.distributionY = args
      .nextFixedSizeArray<u256>()
      .expect('Failed to deserialize distributionY');
    this.to = new Address(args.nextString().expect('Failed to deserialize to'));
    this.deadline = args.nextU64().expect('Failed to deserialize deadline');
    return new Result(args.offset);
  }
}
