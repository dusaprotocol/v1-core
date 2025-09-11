import {
  Context,
  createSC,
  fileToByteArray,
  generateEvent,
  transferCoins,
} from '@massalabs/massa-as-sdk';
import { IERC20, IFactory, IPair, IRouter, IWMAS } from '../interfaces';
import { IQuoter } from '../interfaces/IQuoter';
import { ONE_COIN, PRECISION } from '../libraries';
import { u256 } from 'as-bignum/assembly/integer/u256';

const activeIdMAS_USDC = 8384346; // 0.2 MAS/USDC
const activeIdWETH_MAS = 8381318; // 17950 WETH/MAS ~ 3590 WETH/USDC
const activeIdDAI_USDC = 8112284; // 1 DAI/USDC

const binStepMAS_USDC: u32 = 20;
const binStepETH_MAS: u32 = 15;
const binstepDAI_USDC: u32 = 1;

export function constructor(_: StaticArray<u8>): void {
  main(_);
}

export function main(_: StaticArray<u8>): void {
  const caller = Context.caller();

  // deploy tokens
  const erc20Wasm: StaticArray<u8> = fileToByteArray('build/ERC20.wasm');

  const usdc = new IERC20(createSC(erc20Wasm));
  transferCoins(usdc._origin, 5 * ONE_COIN);
  usdc.init(
    'USD Coin',
    'USDC',
    6,
    u256.mul(u256.from(100_500_000), u256.from(u64(10 ** 6))),
  );

  const dai = new IERC20(createSC(erc20Wasm));
  transferCoins(dai._origin, 5 * ONE_COIN);
  dai.init(
    'DAI',
    'DAI',
    18,
    u256.mul(u256.from(100_000_000), PRECISION),
  );

  const weth = new IERC20(createSC(erc20Wasm));
  transferCoins(weth._origin, 5 * ONE_COIN);
  weth.init(
    'Weth Token',
    'WETH',
    18,
    u256.mul(u256.from(11_500_000), PRECISION),
  );

  // deploy WMAS
  const wmasWasm: StaticArray<u8> = fileToByteArray('build/WMAS.wasm');
  const wmas = new IWMAS(createSC(wmasWasm));
  transferCoins(wmas._origin, 5 * ONE_COIN);
  wmas.init();

  // deploy factory
  const factoryWasm: StaticArray<u8> = fileToByteArray('build/Factory.wasm');
  const factory = new IFactory(createSC(factoryWasm));
  transferCoins(factory._origin, 5 * ONE_COIN);
  factory.init(caller, u256.mul(u256.from(8), u256.from(u64(10 ** 14))));

  // deploy router
  const routerWasm: StaticArray<u8> = fileToByteArray('build/Router.wasm');
  const router = new IRouter(createSC(routerWasm));
  transferCoins(router._origin, 5 * ONE_COIN);
  router.init(wmas._origin, factory._origin);

  // deploy quoter
  const quoterWasm: StaticArray<u8> = fileToByteArray('build/Quoter.wasm');
  const quoter = new IQuoter(createSC(quoterWasm));
  transferCoins(quoter._origin, 5 * ONE_COIN);
  quoter.init(factory._origin);

  factory.addQuoteAsset(usdc._origin);
  factory.addQuoteAsset(wmas._origin);

  // create USDC/WMAS 20 bps LP
  factory.setPreset(
    binStepMAS_USDC,
    10_000,
    30,
    600,
    5_000,
    20_000,
    0,
    350_000,
    120,
  );
  const pair = new IPair(
    factory.createLBPair(
      wmas._origin,
      usdc._origin,
      activeIdMAS_USDC,
      binStepMAS_USDC,
      20 * ONE_COIN,
    ),
  );
  pair.increaseOracleLength(100, 5 * ONE_COIN);

  // create WETH/WMAS 15 bps LP
  factory.setPreset(
    binStepETH_MAS,
    10_000,
    30,
    600,
    5_000,
    30_000,
    0,
    350_000,
    120,
  );

  const pair2 = new IPair(
    factory.createLBPair(
      weth._origin,
      wmas._origin,
      activeIdWETH_MAS,
      binStepETH_MAS,
      20 * ONE_COIN,
    ),
  );
  pair2.increaseOracleLength(100, 5 * ONE_COIN);

  // create USDC/DAI 2bps LP (binstep 1 & base fee 0.02%)
  factory.setPreset(
    binstepDAI_USDC,
    20_000,
    10,
    120,
    5_000,
    2_000_000,
    0,
    100_000,
    120,
  );

  const pair3 = new IPair(
    factory.createLBPair(
      dai._origin,
      usdc._origin,
      activeIdDAI_USDC,
      binstepDAI_USDC,
      20 * ONE_COIN,
    ),
  );
  pair3.increaseOracleLength(100, 5 * ONE_COIN);

  generateEvent(
    [
      usdc._origin.toString(),
      dai._origin.toString(),
      wmas._origin.toString(),
      weth._origin.toString(),
      router._origin.toString(),
      factory._origin.toString(),
      quoter._origin.toString(),
      pair._origin.toString(),
      pair2._origin.toString(),
      pair3._origin.toString(),
    ].join(),
  );
  return;
}