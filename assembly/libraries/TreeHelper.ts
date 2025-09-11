import { u256 } from 'as-bignum/assembly/integer/u256';
import { TREE } from '../storage/Pair';
import { BitMath } from './BitMath';
import { GetIdsFromAboveReturn } from '../structs/Returns';
import { TreeMath__ErrorDepthSearch } from './Errors';
import { Result } from '@massalabs/as-types';

const LAST_BIT = 255;
const SHIFT_DEPTH_2 = 8;
const SHIFT_DEPTH_1 = 16;

/// @notice Helper contract used for finding closest bin with liquidity
export class TreeHelper {
  /** Private pure function to return the ids from above
   * @param _id The current id
   * @return The branch id from above
   * @return The leaf id from above
   */
  static _getIdsFromAbove(_id: u32): GetIdsFromAboveReturn {
    // Optimization of `(_id / 64, _id % 64)`
    return new GetIdsFromAboveReturn(_id >> 8, _id & 255);
  }

  /** Private pure function to return the bottom id
   * @param _branchId The branch id
   * @param _leafId The leaf id
   * @return The bottom branchId
   */
  static _getBottomId(_branchId: u32, _leafId: u32): u32 {
    // Optimization of `_branchId * 64 + _leafId`
    // Can't overflow as _leafId would fit in u8, but kept as u32 to optimize castings
    return (_branchId << 8) + _leafId;
  }

  static addToTree(_id: u64): void {
    // add 1 at the right indices
    const _idDepth2 = i32(_id >> SHIFT_DEPTH_2);
    const _idDepth1 = i32(_id >> SHIFT_DEPTH_1);

    let lvl2 = this.level2(_idDepth2);
    lvl2 = u256.or(lvl2, u256.shl(u256.One, i32(_id & LAST_BIT)));
    this.setLevel2(_idDepth2, lvl2);

    let lvl1 = this.level1(_idDepth1);
    lvl1 = u256.or(lvl1, u256.shl(u256.One, _idDepth2 & LAST_BIT));
    this.setLevel1(_idDepth1, lvl1);

    let lvl0 = this.level0();
    lvl0 = u256.or(lvl0, u256.shl(u256.One, _idDepth1));
    this.setLevel0(lvl0);
  }

  static removeFromTree(_id: u64): void {
    // remove 1 at the right indices
    const _idDepth2 = i32(_id >> SHIFT_DEPTH_2);
    let _newLeafValue: u256 = u256.and(
      this.level2(_idDepth2),
      u256.xor(u256.Max, u256.shl(u256.One, i32(_id & LAST_BIT))),
    );
    this.setLevel2(_idDepth2, _newLeafValue);
    if (_newLeafValue.isZero()) {
      const _idDepth1 = i32(_id >> SHIFT_DEPTH_1);
      _newLeafValue = u256.and(
        this.level1(_idDepth1),
        u256.xor(u256.Max, u256.shl(u256.One, _idDepth2 & LAST_BIT)),
      );
      this.setLevel1(_idDepth1, _newLeafValue);
      if (_newLeafValue.isZero()) {
        let lvl0 = this.level0();
        lvl0 = u256.and(
          lvl0,
          u256.xor(u256.Max, u256.shl(u256.One, _idDepth1)),
        );
        this.setLevel0(lvl0);
      }
    }
  }

  /**
   * Returns the first id that is non zero, corresponding to a bin with liquidity in it
   * @param _binId the binId to start searching
   * @param _rightSide Whether we're searching in the right side of the tree (true) or the left side (false)
   * @return The closest non zero bit on the right (or left) side of the tree
   */
  static findFirstBin(_binId: u32, _rightSide: bool): Result<u32> {
    let current: u256 = u256.Zero;
    let bit: u8 = 0;

    const r = this._getIdsFromAbove(_binId);
    _binId = r.branchId;
    bit = u8(r.leafId);

    // Search in depth 2
    if ((_rightSide && bit != 0) || (!_rightSide && bit != LAST_BIT)) {
      current = this.level2(_binId);
      const _bit = BitMath.closestBit(current, bit, _rightSide);

      if (_bit.isOk()) {
        return new Result(this._getBottomId(_binId, _bit.unwrap()));
      }
    }

    const r2 = this._getIdsFromAbove(_binId);
    _binId = r2.branchId;
    bit = u8(r2.leafId);

    // Search in depth 1
    if ((_rightSide && bit != 0) || (!_rightSide && bit != LAST_BIT)) {
      current = this.level1(_binId);
      const _bit = BitMath.closestBit(current, bit, _rightSide);

      if (_bit.isOk()) {
        _binId = this._getBottomId(_binId, _bit.unwrap());
        current = this.level2(_binId);

        return new Result(
          this._getBottomId(
            _binId,
            BitMath.significantBit(current, _rightSide),
          ),
        );
      }
    }

    // Search in depth 0
    current = this.level0();
    const _bit = BitMath.closestBit(current, u8(_binId), _rightSide);
    if (_bit.isErr()) {
      return new Result(u32(0), TreeMath__ErrorDepthSearch());
    }
    bit = _bit.unwrap();

    current = this.level1(bit);
    _binId = this._getBottomId(
      u32(bit),
      BitMath.significantBit(current, _rightSide),
    );

    current = this.level2(_binId);
    return new Result(
      this._getBottomId(_binId, BitMath.significantBit(current, _rightSide)),
    );
  }

  static level0(): u256 {
    return TREE.get('0', u256.Zero);
  }
  static level1(index: i32): u256 {
    return TREE.get('1:' + index.toString(), u256.Zero);
  }
  static level2(index: i32): u256 {
    return TREE.get('2:' + index.toString(), u256.Zero);
  }
  static setLevel0(value: u256): void {
    TREE.set('0', value);
  }
  static setLevel1(index: i32, value: u256): void {
    TREE.set('1:' + index.toString(), value);
  }
  static setLevel2(index: i32, value: u256): void {
    TREE.set('2:' + index.toString(), value);
  }
}
