import { Args, Result, Serializable } from '@massalabs/as-types';
import { Address } from '@massalabs/massa-as-sdk';
import { IPair } from '../interfaces';
import {
  Bin,
  Debt,
  FeeParameters,
  LBPairInformation,
  LiquidityParameters,
  MintInfo,
  FeesDistribution,
  PairInformation,
} from '../structs';
import { SCALE_OFFSET } from '../libraries';
import { u256 } from 'as-bignum/assembly/integer';

const randomBool = (): boolean => (Math.random() > 0.5 ? true : false);
const randomString = (): string => Math.random().toString(36).substring(7);
const randomAddress = (): Address => new Address(randomString());
const randomU32 = (): u32 => u32(Math.random() * F32.MAX_SAFE_INTEGER);
const randomU64 = (): u64 => u64(Math.random() * F64.MAX_SAFE_INTEGER);

describe('LBPairInformation', () => {
  test('ser/deser', () => {
    const binStep: u32 = randomU32();
    const pair = new IPair(randomAddress());
    const createdByOwner = randomBool();
    const ignoredForRouting = randomBool();
    const struct = new LBPairInformation(
      binStep,
      pair,
      createdByOwner,
      ignoredForRouting,
    );
    const ser = struct.serialize();
    const deser = new Args(ser).nextSerializable<LBPairInformation>().unwrap();
    expect(deser.binStep).toBe(binStep);
    expect(deser.pair).toStrictEqual(pair);
    expect(deser.createdByOwner).toBe(createdByOwner);
    expect(deser.ignoredForRouting).toBe(ignoredForRouting);
  });
});
describe('Bin', () => {
  test('ser/deser', () => {
    const reserveX = u256.from(randomU64());
    const reserveY = u256.from(randomU64());
    const accTokenXPerShare = u256.from(randomU64());
    const accTokenYPerShare = u256.from(randomU64());
    const struct = new Bin(
      reserveX,
      reserveY,
      accTokenXPerShare,
      accTokenYPerShare,
    );
    const ser = struct.serialize();
    const deser = new Args(ser).nextSerializable<Bin>().unwrap();
    expect(deser.reserveX).toBe(reserveX);
    expect(deser.reserveY).toBe(reserveY);
    expect(deser.accTokenXPerShare).toBe(accTokenXPerShare);
    expect(deser.accTokenYPerShare).toBe(accTokenYPerShare);
  });
  test('update fees X', () => {
    const bin = new Bin();
    const pair = new PairInformation();
    const fees = new FeesDistribution(
      u256.from(randomU64()),
      u256.from(randomU64()),
    );
    const swapForY = true;
    const totalSupply = u256.from(randomU64());
    bin.updateFees(pair, fees, swapForY, totalSupply);
    expect(pair.feesX).toStrictEqual(fees);
  });
  test('update fees Y', () => {
    const bin = new Bin();
    const pair = new PairInformation();
    const fees = new FeesDistribution(
      u256.from(randomU64()),
      u256.from(randomU64()),
    );
    const swapForY = false;
    const totalSupply = u256.from(randomU64());
    bin.updateFees(pair, fees, swapForY, totalSupply);
    expect(pair.feesY).toStrictEqual(fees);
  });
});
describe('Debt', () => {
  test('ser/deser', () => {
    const debtX = u256.from(randomU64());
    const debtY = u256.from(randomU64());
    const struct = new Debt(debtX, debtY);
    const ser = struct.serialize();
    const deser = new Args(ser).nextSerializable<Debt>().unwrap();
    expect(deser.debtX).toBe(debtX);
    expect(deser.debtY).toBe(debtY);
  });
});
describe('FeeParameters', () => {
  test('ser/deser', () => {
    const binStep = randomU32();
    const baseFactor = randomU32();
    const filterPeriod = randomU32();
    const decayPeriod = randomU32();
    const reductionFactor = randomU32();
    const variableFeeControl = randomU32();
    const protocolShare = randomU32();
    const maxVolatilityAccumulated = randomU32();
    const volatilityAccumulated = randomU32();
    const volatilityReference = randomU32();
    const indexRef = randomU32();
    const time = randomU64();
    const fp = new FeeParameters(
      binStep,
      baseFactor,
      filterPeriod,
      decayPeriod,
      reductionFactor,
      variableFeeControl,
      protocolShare,
      maxVolatilityAccumulated,
      volatilityAccumulated,
      volatilityReference,
      indexRef,
      time,
    );
    const ser = fp.serialize();
    const deser = new Args(ser).nextSerializable<FeeParameters>().unwrap();
    expect(deser.binStep).toBe(binStep);
    expect(deser.baseFactor).toBe(baseFactor);
    expect(deser.filterPeriod).toBe(filterPeriod);
    expect(deser.decayPeriod).toBe(decayPeriod);
    expect(deser.reductionFactor).toBe(reductionFactor);
    expect(deser.variableFeeControl).toBe(variableFeeControl);
    expect(deser.protocolShare).toBe(protocolShare);
    expect(deser.maxVolatilityAccumulated).toBe(maxVolatilityAccumulated);
    expect(deser.volatilityAccumulated).toBe(volatilityAccumulated);
    expect(deser.volatilityReference).toBe(volatilityReference);
    expect(deser.indexRef).toBe(indexRef);
    expect(deser.time).toBe(time);
  });
  test('get base fee', () => {
    const fp = new FeeParameters();
    // expect(fp.getBaseFee()).toStrictEqual(1);
  });
});
describe('FeesDistribution', () => {
  test('ser/deser', () => {
    const total = u256.from(randomU64());
    const protocol = u256.from(randomU64());
    const fees = new FeesDistribution(total, protocol);
    const ser = fees.serialize();
    const deser = new Args(ser).nextSerializable<FeesDistribution>().unwrap();
    expect(deser.total).toBe(total);
    expect(deser.protocol).toBe(protocol);
  });
  test('getTokenPerShare', () => {
    const total = u256.from(randomU32());
    const fees = new FeesDistribution(total, u256.div(total, u256.from(2)));
    const totalSupply = u256.from(randomU64());
    const tokenPerShare = fees.getTokenPerShare(totalSupply);
    expect(tokenPerShare).toBe(
      u256.div(
        u256.shl(u256.sub(fees.total, fees.protocol), SCALE_OFFSET),
        totalSupply,
      ),
    );
  });
});
describe('PairInformation', () => {
  test('ser/deser', () => {
    const activeId = randomU32();
    const reserveX = u256.from(randomU64());
    const reserveY = u256.from(randomU64());
    const feesX = new FeesDistribution(
      u256.from(randomU64()),
      u256.from(randomU64()),
    );
    const feesY = new FeesDistribution(
      u256.from(randomU64()),
      u256.from(randomU64()),
    );
    const oracleSampleLifetime = randomU32();
    const oracleSize = randomU32();
    const oracleActiveSize = randomU32();
    const oracleLastTimestamp = randomU64();
    const oracleId = randomU32();

    const pairInfo = new PairInformation(
      activeId,
      reserveX,
      reserveY,
      feesX,
      feesY,
      oracleSampleLifetime,
      oracleSize,
      oracleActiveSize,
      oracleLastTimestamp,
      oracleId,
    );
    const ser = pairInfo.serialize();
    const deser = new Args(ser).nextSerializable<PairInformation>().unwrap();
    expect(deser.activeId).toBe(activeId);
    expect(deser.reserveX).toBe(reserveX);
    expect(deser.reserveY).toBe(reserveY);
    expect(deser.feesX).toStrictEqual(feesX);
    expect(deser.feesY).toStrictEqual(feesY);
    expect(deser.oracleSampleLifetime).toBe(oracleSampleLifetime);
    expect(deser.oracleSize).toBe(oracleSize);
    expect(deser.oracleActiveSize).toBe(oracleActiveSize);
    expect(deser.oracleLastTimestamp).toBe(oracleLastTimestamp);
    expect(deser.oracleId).toBe(oracleId);
  });
});
