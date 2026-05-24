// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ERC1967Proxy {
    uint256 private constant IMPLEMENTATION_SLOT = 0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC;

    constructor(address implementation, bytes memory data) payable {
        require(implementation.code.length > 0, "implementation required");
        assembly {
            sstore(IMPLEMENTATION_SLOT, implementation)
        }

        if (data.length > 0) {
            (bool ok, bytes memory result) = implementation.delegatecall(data);
            if (!ok) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
        }
    }

    fallback() external payable {
        _fallback();
    }

    receive() external payable {
        _fallback();
    }

    function _fallback() internal {
        assembly {
            let implementation := sload(IMPLEMENTATION_SLOT)
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
