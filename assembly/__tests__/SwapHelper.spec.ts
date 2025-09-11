import { ID_ONE, PRECISION, SwapHelper } from '../libraries';
import { Bin, FeeParameters, FeesDistribution } from '../structs';
import { GetAmountsReturn } from '../structs/Returns';
import { u256 } from 'as-bignum/assembly/integer';

const ONE = u256.from(PRECISION);

describe('SwapHelper', () => {
  test('getAmounts', () => {
    const activeId = ID_ONE;
    const binStep = 1;
    const bin = new Bin(
      u256.mul(u256.from(100000), ONE),
      u256.mul(u256.from(200000), ONE),
    );
    const fp = new FeeParameters(binStep);
    const res = SwapHelper.getAmounts(
      bin,
      fp,
      activeId,
      true,
      u256.mul(u256.from(50), ONE),
    );
    const expected = new GetAmountsReturn(
      u256.mul(u256.from(50), ONE),
      u256.mul(u256.from(50), ONE),
      new FeesDistribution(u256.Zero, u256.Zero),
    );
    expect(res).toStrictEqual(expected);
  });
});
