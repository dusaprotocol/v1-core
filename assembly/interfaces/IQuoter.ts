import { Args } from '@massalabs/as-types';
import { Address, call, Storage } from '@massalabs/massa-as-sdk';
import { FACTORY } from '../storage/Quoter';
import { Quote } from '../structs/Quote';
import { IFactory } from './IFactory';
import { u256 } from 'as-bignum/assembly/integer/u256';

export class IQuoter {
  constructor(public _origin: Address) {}

  init(factory: Address): void {
    const args = new Args().add(factory);
    call(this._origin, 'constructor', args, 0);
  }

  findBestPathFromAmountIn(route: Address[], amountIn: u256): Quote {
    const args = new Args().addSerializableObjectArray(route).add(amountIn);
    const res = call(this._origin, 'findBestPathFromAmountIn', args, 0);
    return new Args(res).nextSerializable<Quote>().unwrap();
  }

  findBestPathFromAmountOut(route: Address[], amountOut: u256): Quote {
    const args = new Args().addSerializableObjectArray(route).add(amountOut);
    const res = call(this._origin, 'findBestPathFromAmountOut', args, 0);
    return new Args(res).nextSerializable<Quote>().unwrap();
  }

  factory(): IFactory {
    const address = new Address(Storage.getOf(this._origin, FACTORY));
    return new IFactory(address);
  }
}
