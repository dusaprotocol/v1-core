import { Storage } from '@massalabs/massa-as-sdk';
import {
  ReentrancyGuardUpgradeable__AlreadyInitialized,
  ReentrancyGuardUpgradeable__ReentrantCall,
} from './Errors';
import { byteToU8, u8toByte } from '@massalabs/as-types';
import { STATUS } from '../storage/Pair';

// The values being non-zero value makes deployment a bit more expensive,
// but in exchange the refund on every call to nonReentrant will be lower in
// amount. Since refunds are capped to a percentage of the total
// transaction's gas, it is best to keep them low in cases like this one, to
// increase the likelihood of the full refund coming into effect.
const _NOT_ENTERED: u8 = 1;
const _ENTERED: u8 = 2;

/// @title Reentrancy Guard
/// @notice Contract module that helps prevent reentrant calls to a function
export class ReentrancyGuardUpgradeable {
  static __ReentrancyGuard_init(): void {
    assert(
      !Storage.has(STATUS),
      ReentrancyGuardUpgradeable__AlreadyInitialized(),
    );

    Storage.set(STATUS, u8toByte(_NOT_ENTERED));
  }

  /// @notice Prevents a contract from calling itself, directly or indirectly.
  /// Calling a `nonReentrant` function from another `nonReentrant`
  /// function is not supported. It is possible to prevent this from happening
  /// by making the `nonReentrant` function external, and making it call a
  /// `private` function that does the actual work
  static nonReentrant(): void {
    // On the first call to nonReentrant, _notEntered will be true

    assert(
      byteToU8(Storage.get(STATUS)) == _NOT_ENTERED,
      ReentrancyGuardUpgradeable__ReentrantCall(),
    );

    // Any calls to nonReentrant after this point will fail
    Storage.set(STATUS, u8toByte(_ENTERED));
  }

  static endNonReentrant(): void {
    Storage.set(STATUS, u8toByte(_NOT_ENTERED));
  }
}
