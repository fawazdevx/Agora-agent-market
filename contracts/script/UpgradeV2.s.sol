// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AgoraAgentMarket} from "../src/AgoraAgentMarket.sol";

contract UpgradeV2 is Script {
    function run() external returns (AgoraAgentMarket implementation) {
        address proxy = vm.envAddress("AGORA_MARKET_PROXY");
        address feeRecipient = vm.envOr("FEE_RECIPIENT", msg.sender);
        address resolver = vm.envOr("RESOLVER", msg.sender);
        uint256 protocolFeeBps = vm.envOr("PROTOCOL_FEE_BPS", uint256(200));
        uint256 resolverFeeBps = vm.envOr("RESOLVER_FEE_BPS", uint256(500));

        vm.startBroadcast();
        implementation = new AgoraAgentMarket();
        AgoraAgentMarket(proxy).upgradeToAndCall(
            address(implementation),
            abi.encodeCall(AgoraAgentMarket.setProtocolConfig, (feeRecipient, resolver, protocolFeeBps, resolverFeeBps))
        );
        vm.stopBroadcast();
    }
}
