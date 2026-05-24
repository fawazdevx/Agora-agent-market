// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AgoraAgentMarket} from "../src/AgoraAgentMarket.sol";
import {ERC1967Proxy} from "../src/ERC1967Proxy.sol";

contract Deploy is Script {
    function run() external returns (AgoraAgentMarket market, AgoraAgentMarket implementation, ERC1967Proxy proxy) {
        address usdc = vm.envOr("USDC_ADDRESS", address(0x3600000000000000000000000000000000000000));
        uint256 minStake = vm.envOr("MIN_STAKE_USDC", uint256(1_000_000));

        vm.startBroadcast();
        implementation = new AgoraAgentMarket();
        proxy = new ERC1967Proxy(address(implementation), abi.encodeCall(AgoraAgentMarket.initialize, (usdc, minStake)));
        market = AgoraAgentMarket(address(proxy));
        market.initializeV2(
            vm.envOr("FEE_RECIPIENT", msg.sender),
            vm.envOr("RESOLVER", msg.sender),
            vm.envOr("PROTOCOL_FEE_BPS", uint256(200)),
            vm.envOr("RESOLVER_FEE_BPS", uint256(500))
        );
        vm.stopBroadcast();
    }
}
