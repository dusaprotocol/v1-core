import { Args, Result, Serializable } from '@massalabs/as-types';
import { FeesDistribution, PairInformation } from '.';
import { SafeMath256 } from '../libraries/SafeMath';
import { u256 } from 'as-bignum/assembly/integer/u256';

/// @dev Structure to store the reserves of bins:
export class Bin implements Serializable {
  /**
   * @param {u256} reserveX The current reserve of tokenX of the bin
   * @param {u256} reserveY The current reserve of tokenY of the bin
   */
  constructor(
    public reserveX: u256 = u256.Zero,
    public reserveY: u256 = u256.Zero,
    public accTokenXPerShare: u256 = u256.Zero,
    public accTokenYPerShare: u256 = u256.Zero,
  ) {}

  /**
   * Update the fees of the pair and accumulated token per share of the bin
   *
   * @param {FeesDistribution} pairFees - The current fees of the pair information
   * @param {FeesDistribution} fees - The fees amounts added to the pairFees
   * @param {bool} swapForY - whether the token sent was Y (true) or X (false)
   * @param {u256} totalSupply - The total supply of the token id
   */
  updateFees(
    pair: PairInformation,
    fees: FeesDistribution,
    swapForY: bool,
    totalSupply: u256,
  ): void {
    if (swapForY) {
      pair.feesX.total = SafeMath256.add(pair.feesX.total, fees.total);
      // unsafe math is fine because total >= protocol
      pair.feesX.protocol = u256.add(pair.feesX.protocol, fees.protocol);
      this.accTokenXPerShare = SafeMath256.add(
        this.accTokenXPerShare,
        fees.getTokenPerShare(totalSupply),
      );
    } else {
      pair.feesY.total = SafeMath256.add(pair.feesY.total, fees.total);
      // unsafe math is fine because total >= protocol
      pair.feesY.protocol = u256.add(pair.feesY.protocol, fees.protocol);
      this.accTokenYPerShare = SafeMath256.add(
        this.accTokenYPerShare,
        fees.getTokenPerShare(totalSupply),
      );
    }
  }

  /**
   * Update reserves
   *
   * @param {PairInformation} pair - The pair information
   * @param {bool} swapForY - whether the token sent was Y (true) or X (false)
   * @param {u256} amountInToBin - The amount of token that is added to the bin without fees
   * @param {u256} amountOutOfBin - The amount of token that is removed from the bin
   */
  updateReserves(
    pair: PairInformation,
    swapForY: bool,
    amountInToBin: u256,
    amountOutOfBin: u256,
  ): void {
    if (swapForY) {
      this.reserveX = SafeMath256.add(this.reserveX, amountInToBin);

      // safe uncheck
      this.reserveY = u256.sub(this.reserveY, amountOutOfBin);
      pair.reserveX = u256.add(pair.reserveX, amountInToBin);
      pair.reserveY = u256.sub(pair.reserveY, amountOutOfBin);
    } else {
      this.reserveY = SafeMath256.add(this.reserveY, amountInToBin);

      // safe uncheck
      this.reserveX = u256.sub(this.reserveX, amountOutOfBin);
      pair.reserveX = u256.sub(pair.reserveX, amountOutOfBin);
      pair.reserveY = u256.add(pair.reserveY, amountInToBin);
    }
  }

  // ======================================================== //
  // ====                  SERIALIZATION                 ==== //
  // ======================================================== //

  serialize(): StaticArray<u8> {
    return new Args()
      .add(this.reserveX)
      .add(this.reserveY)
      .add(this.accTokenXPerShare)
      .add(this.accTokenYPerShare)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.reserveX = args.nextU256().expect("Can't deserialize reserveX");
    this.reserveY = args.nextU256().expect("Can't deserialize reserveY");
    this.accTokenXPerShare = args
      .nextU256()
      .expect("Can't deserialize accTokenXPerShare");
    this.accTokenYPerShare = args
      .nextU256()
      .expect("Can't deserialize accTokenYPerShare");
    return new Result(args.offset);
  }
}
