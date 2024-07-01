import { Args, Result, Serializable } from '@massalabs/as-types';
import { Context } from '@massalabs/massa-as-sdk';
import {
  BASIS_POINT_MAX,
  PRECISION,
  SafeMath,
  SafeMath256,
} from '../libraries';
import { FeesDistribution } from './FeesDistribution';
import { u256 } from 'as-bignum/assembly/integer/u256';

/// @dev Structure to store the protocol fees:
export class FeeParameters implements Serializable {
  /**
   * @param {u32} binStep - The bin step
   * @param {u32} baseFactor - The base factor
   * @param {u32} filterPeriod - The filter period, where the fees stays constant
   * @param {u32} decayPeriod - The decay period, where the fees are halved
   * @param {u32} reductionFactor - The reduction factor, used to calculate the reduction of the accumulator
   * @param {u32} variableFeeControl - The variable fee control, used to control the variable fee, can be 0 to disable them
   * @param {u32} protocolShare - The share of fees sent to protocol
   * @param {u32} maxVolatilityAccumulated - The max value of volatility accumulated
   * @param {u32} volatilityAccumulated - The value of volatility accumulated
   * @param {u32} volatilityReference - The value of volatility reference
   * @param {u32} indexRef - The index reference
   * @param {u64} time - The last time the accumulator was called
   */
  constructor(
    public binStep: u32 = 0,
    public baseFactor: u32 = 0,
    public filterPeriod: u32 = 0,
    public decayPeriod: u32 = 0,
    public reductionFactor: u32 = 0,
    public variableFeeControl: u32 = 0,
    public protocolShare: u32 = 0,
    public maxVolatilityAccumulated: u32 = 0,
    public volatilityAccumulated: u32 = 0,
    public volatilityReference: u32 = 0,
    public indexRef: u32 = 0,
    public time: u64 = Context.timestamp(),
  ) {}

  /**
   * Return the fees distribution added to an amount
   *
   * @param {u256} _fees - The fee amount
   * @return {FeesDistribution}
   */
  getFeeAmountDistribution(_fees: u256): FeesDistribution {
    const fees = new FeesDistribution();
    fees.total = _fees;

    fees.protocol = u256.div(
      SafeMath256.mul(_fees, u256.from(this.protocolShare)),
      u256.from(BASIS_POINT_MAX),
    );
    return fees;
  }

  /**
   * @notice Return the fees to add to an amount
   * @dev Rounds amount up, follows `amountWithFees = amount + getFeeAmount(amount)`
   * @param _amount The amount of token sent
   * @return The fee amount to add to the amount
   */
  getFeeAmount(_amount: u256): u256 {
    const _fee = this.getTotalFee();
    const _denominator = u256.sub(PRECISION, _fee);
    const mul = SafeMath256.mul(_amount, _fee);
    const add = SafeMath256.add(mul, _denominator);
    const sub = SafeMath256.sub(add, u256.One);
    return u256.div(sub, _denominator);
  }

  /**
   * @notice Return the amount of fees from an amount
   * @dev Rounds amount up, follows `amount = amountWithFees - getFeeAmountFrom(amountWithFees)`
   * @param _amountWithFees The amount of token sent
   * @return The fee amount from the amount sent
   */
  getFeeAmountFrom(_amountWithFees: u256): u256 {
    return u256.div(
      SafeMath256.add(
        SafeMath256.mul(_amountWithFees, this.getTotalFee()),
        u256.sub(PRECISION, u256.One),
      ),
      PRECISION,
    );
  }

  /**
   * @notice Return the fees added when an user adds liquidity and change the ratio in the active bin
   * @dev Rounds amount up
   * @param _amountWithFees The amount of token sent
   * @return The fee amount
   */
  getFeeAmountForC(_amountWithFees: u256): u256 {
    const _fee = this.getTotalFee();
    const _denominator = u256.mul(PRECISION, PRECISION);
    return u256.div(
      SafeMath256.add(
        SafeMath256.mul(
          _amountWithFees,
          SafeMath256.mul(_fee, u256.add(_fee, PRECISION)),
        ),
        u256.sub(_denominator, u256.One),
      ),
      _denominator,
    );
  }

  /**
   * @notice Return the total fee, i.e. baseFee + variableFee
   * @return The total fee, with 18 decimals
   */
  getTotalFee(): u256 {
    // unsafe math is fine
    return u256.add(this.getBaseFee(), this.getVariableFee());
  }

  /**
   * @notice Returns the base fee added to a swap, with 18 decimals
   */
  getBaseFee(): u256 {
    return u256.mul(
      u256.from(this.baseFactor * this.binStep),
      u256.from(u64(10 ** 10)),
    );
  }

  /**
   * @notice Returns the variable fee added to a swap, with 18 decimals
   */
  getVariableFee(): u256 {
    if (this.variableFeeControl != 0) {
      // Can't overflow as the max value is `max(u32) * (max(u32) * max(u32)) ** 2 < max(u256)`
      // It returns 18 decimals as:
      // decimals(variableFeeControl * (volatilityAccumulated * binStep)**2 / 100) = 4 + (4 + 4) * 2 - 2 = 18
      const _prod = u256.from(this.volatilityAccumulated * this.binStep);
      return u256.div(
        u256.add(
          u256.mul(u256.mul(_prod, _prod), u256.from(this.variableFeeControl)),
          u256.from(99),
        ),
        u256.from(100),
      );
    }
    return u256.Zero;
  }

  /**
   * Update the value of the volatility accumulated
   *
   * @param {u64} _activeId - The current active id
   */
  updateVariableFeeParameters(_activeId: u64): void {
    const timestamp = Context.timestamp();
    const _deltaT = SafeMath.sub(timestamp, this.time);

    if (_deltaT >= this.filterPeriod || this.time == 0) {
      this.indexRef = u32(_activeId);
      if (_deltaT < this.decayPeriod) {
        this.volatilityReference =
          (this.reductionFactor * this.volatilityAccumulated) / BASIS_POINT_MAX;
      } else {
        this.volatilityReference = 0;
      }
    }

    this.time = timestamp;

    this.updateVolatilityAccumulated(_activeId);
  }

  /**
   * Update the volatility accumulated
   *
   * @param {u64} _activeId - The current active id
   */
  updateVolatilityAccumulated(_activeId: u64): void {
    const id = u32(_activeId);
    const volatilityAccumulated =
      (id > this.indexRef ? id - this.indexRef : this.indexRef - id) *
        BASIS_POINT_MAX +
      this.volatilityReference;
    this.volatilityAccumulated =
      volatilityAccumulated > this.maxVolatilityAccumulated
        ? this.maxVolatilityAccumulated
        : volatilityAccumulated;
  }

  // ======================================================== //
  // ====                  SERIALIZATION                 ==== //
  // ======================================================== //

  serialize(): StaticArray<u8> {
    return new Args()
      .add(this.binStep)
      .add(this.baseFactor)
      .add(this.filterPeriod)
      .add(this.decayPeriod)
      .add(this.reductionFactor)
      .add(this.variableFeeControl)
      .add(this.protocolShare)
      .add(this.maxVolatilityAccumulated)
      .add(this.volatilityAccumulated)
      .add(this.volatilityReference)
      .add(this.indexRef)
      .add(this.time)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.binStep = args.nextU32().expect('Failed to deserialize binStep');
    this.baseFactor = args.nextU32().expect('Failed to deserialize baseFactor');
    this.filterPeriod = args
      .nextU32()
      .expect('Failed to deserialize filterPeriod');
    this.decayPeriod = args
      .nextU32()
      .expect('Failed to deserialize decayPeriod');
    this.reductionFactor = args
      .nextU32()
      .expect('Failed to deserialize reductionFactor');
    this.variableFeeControl = args
      .nextU32()
      .expect('Failed to deserialize variableFeeControl');
    this.protocolShare = args
      .nextU32()
      .expect('Failed to deserialize protocolShare');
    this.maxVolatilityAccumulated = args
      .nextU32()
      .expect('Failed to deserialize maxVolatilityAccumulated');
    this.volatilityAccumulated = args
      .nextU32()
      .expect('Failed to deserialize volatilityAccumulated');
    this.volatilityReference = args
      .nextU32()
      .expect('Failed to deserialize volatilityReference');
    this.indexRef = args.nextU32().expect('Failed to deserialize indexRef');
    this.time = args.nextU64().expect('Failed to deserialize time');
    return new Result(args.offset);
  }
}
