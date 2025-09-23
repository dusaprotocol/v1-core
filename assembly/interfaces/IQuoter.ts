import { Args } from '@massalabs/as-types';
import { Address, call, Storage } from '@massalabs/massa-as-sdk';
import { FACTORY, LEGACYFACTORY, V0FACTORY } from '../storage/Quoter';
import { Quote } from '../structs/Quote';
import { IFactory } from './IFactory';
import { IV0Factory } from './IV0Factory';
import { u256 } from 'as-bignum/assembly/integer/u256';

export class IQuoter {
  constructor(public _origin: Address) {}

  init(factory: Address, v0Factory: Address, legacyFactory: Address): void {
    const args = new Args().add(factory).add(v0Factory).add(legacyFactory);
    call(this._origin, 'constructor', args, 0);
  }

  findBestPathFromAmountIn(
    route: Address[],
    amountIn: u256,
    checkLegacy: bool,
  ): Quote {
    const args = new Args()
      .addSerializableObjectArray(route)
      .add(amountIn)
      .add(checkLegacy);
    const res = call(this._origin, 'findBestPathFromAmountIn', args, 0);
    return new Args(res).nextSerializable<Quote>().unwrap();
  }

  findBestPathFromAmountOut(
    route: Address[],
    amountOut: u256,
    checkLegacy: bool,
  ): Quote {
    const args = new Args()
      .addSerializableObjectArray(route)
      .add(amountOut)
      .add(checkLegacy);
    const res = call(this._origin, 'findBestPathFromAmountOut', args, 0);
    return new Args(res).nextSerializable<Quote>().unwrap();
  }

  factory(): IFactory {
    const address = new Address(Storage.getOf(this._origin, FACTORY));
    return new IFactory(address);
  }

  v0Factory(): IV0Factory {
    const address = new Address(Storage.getOf(this._origin, V0FACTORY));
    return new IV0Factory(address);
  }

  legacyFactory(): IV0Factory {
    const address = new Address(Storage.getOf(this._origin, LEGACYFACTORY));
    return new IV0Factory(address);
  }
}
