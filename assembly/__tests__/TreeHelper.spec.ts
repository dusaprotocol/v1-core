import { resetStorage } from '@massalabs/massa-as-sdk';
import { u256 } from 'as-bignum/assembly';
import { TreeHelper } from '../libraries';
import { GetIdsFromAboveReturn } from '../structs/Returns';

describe('TreeHelper', () => {
  const id = 8192;
  const branchId = id >> 8;
  const leafId = id & 255;

  test('Get IDs from above', () => {
    const res = TreeHelper._getIdsFromAbove(id);
    const expected = new GetIdsFromAboveReturn(branchId, leafId);
    expect(res).toStrictEqual(expected);
  });
  test('Get bottom id', () => {
    const res = TreeHelper._getBottomId(branchId, leafId);
    const expected = id;
    expect(res).toStrictEqual(expected);
  });
});
describe('Tree', () => {
  beforeEach(() => resetStorage());

  test('Add to tree', () => {
    const id = 7182;
    const _idDepth2 = id / 256;
    const _idDepth1 = id / 256 / 256;

    TreeHelper.addToTree(id);

    expect(TreeHelper.level0()).toStrictEqual(
      u256.shl(u256.One, _idDepth1 & 255),
    );
    expect(TreeHelper.level1(_idDepth1)).toStrictEqual(
      u256.shl(u256.One, _idDepth2 & 255),
    );
    expect(TreeHelper.level2(_idDepth2)).toStrictEqual(
      u256.shl(u256.One, id & 255),
    );
  });
  test('Find first bin', () => {
    const id = 3;
    const id2 = 300;
    const id3 = 7183;

    TreeHelper.addToTree(id);
    TreeHelper.addToTree(id2);
    TreeHelper.addToTree(id3);

    expect(TreeHelper.findFirstBin(id, false).unwrap()).toStrictEqual(id2);
    expect(TreeHelper.findFirstBin(id2, true).unwrap()).toStrictEqual(id);
    expect(TreeHelper.findFirstBin(id2, false).unwrap()).toStrictEqual(id3);
    expect(TreeHelper.findFirstBin(id3, true).unwrap()).toStrictEqual(id2);
  });
  throws('Find inacessible bin', () => {
    const id = 5;
    const id2 = 500;

    TreeHelper.addToTree(id);
    TreeHelper.addToTree(id2);

    TreeHelper.findFirstBin(id, true);
  });
  test('Remove from tree', () => {
    const id = 1;
    const id2 = 2;
    const id3 = 100000;

    TreeHelper.addToTree(id);
    TreeHelper.addToTree(id2);
    TreeHelper.addToTree(id3);

    expect(TreeHelper.findFirstBin(id, false).unwrap()).toStrictEqual(id2);
    expect(TreeHelper.findFirstBin(id2, true).unwrap()).toStrictEqual(id);
    expect(TreeHelper.findFirstBin(id2, false).unwrap()).toStrictEqual(id3);
    expect(TreeHelper.findFirstBin(id3, true).unwrap()).toStrictEqual(id2);
  });
  throws('Find inacessible bin', () => {
    const id = 5;
    const id2 = 500;

    TreeHelper.addToTree(id);
    TreeHelper.addToTree(id2);

    TreeHelper.findFirstBin(id, true);
  });
  test('Remove from tree', () => {
    const id = 1;
    const id2 = 2;
    const id3 = 63;

    const _idDepth2 = id2 / 256;
    const _idDepth1 = id2 / 256 / 256;

    TreeHelper.addToTree(id);
    TreeHelper.addToTree(id2);
    TreeHelper.addToTree(id3);
    TreeHelper.removeFromTree(id);
    TreeHelper.removeFromTree(id3);

    expect(TreeHelper.level0()).toStrictEqual(
      u256.shl(u256.One, _idDepth1 & 255),
    );
    expect(TreeHelper.level1(_idDepth1)).toStrictEqual(
      u256.shl(u256.One, _idDepth2 & 255),
    );
    expect(TreeHelper.level2(_idDepth2)).toStrictEqual(
      u256.shl(u256.One, id2 & 255),
    );
  });
});
