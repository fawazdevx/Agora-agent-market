// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgoraAgentMarket} from "../src/AgoraAgentMarket.sol";
import {ERC1967Proxy} from "../src/ERC1967Proxy.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract AgoraAgentMarketV2 is AgoraAgentMarket {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract AgoraAgentMarketTest is Test {
    MockUSDC private usdc;
    AgoraAgentMarket private market;
    address private agent = address(0xA11CE);
    address private treasury = address(0xFEE);
    address private resolver = address(0xB07);

    function setUp() external {
        usdc = new MockUSDC();
        AgoraAgentMarket implementation = new AgoraAgentMarket();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation), abi.encodeCall(AgoraAgentMarket.initialize, (address(usdc), 1_000_000))
        );
        market = AgoraAgentMarket(address(proxy));
        usdc.mint(agent, 10_000_000);
    }

    function testPublishSignalStakesUsdc() external {
        vm.startPrank(agent);
        usdc.approve(address(market), 2_000_000);
        uint256 signalId = market.publishSignal(
            "Macro Scout",
            "BTC-USD",
            "ETF flow acceleration supports upside.",
            "LONG",
            2_000_000,
            120_000e6,
            78,
            block.timestamp + 7 days
        );
        vm.stopPrank();

        assertEq(signalId, 0);
        assertEq(usdc.balanceOf(address(market)), 2_000_000);
        (uint256 signals,,,,) = market.agentStats(agent);
        assertEq(signals, 1);
    }

    function testResolveWinningSignalReturnsStake() external {
        vm.startPrank(agent);
        usdc.approve(address(market), 2_000_000);
        market.publishSignal(
            "Macro Scout", "BTC-USD", "Upside", "LONG", 2_000_000, 120_000e6, 78, block.timestamp + 7 days
        );
        vm.stopPrank();

        market.resolveSignal(0, AgoraAgentMarket.SignalStatus.Won, "https://example.com/evidence");

        assertEq(usdc.balanceOf(agent), 10_000_000);
        (uint256 signals, uint256 wins,,, uint256 rewards) = market.agentStats(agent);
        assertEq(signals, 1);
        assertEq(wins, 1);
        assertEq(rewards, 2_000_000);
    }

    function testProtocolFeeOnPublish() external {
        market.initializeV2(treasury, resolver, 200, 500);

        vm.startPrank(agent);
        usdc.approve(address(market), 2_000_000);
        market.publishSignal(
            "Macro Scout", "BTC-USD", "Upside", "LONG", 2_000_000, 120_000e6, 78, block.timestamp + 7 days
        );
        vm.stopPrank();

        assertEq(usdc.balanceOf(treasury), 40_000);
        assertEq(usdc.balanceOf(address(market)), 1_960_000);
        (,,,, uint256 rewards) = market.agentStats(agent);
        assertEq(rewards, 0);
        assertEq(market.protocolRevenue(), 40_000);
    }

    function testAutoResolveWinningLongReturnsLockedStake() external {
        market.initializeV2(treasury, resolver, 200, 500);

        vm.startPrank(agent);
        usdc.approve(address(market), 2_000_000);
        market.publishSignal(
            "Macro Scout", "BTC-USD", "Upside", "LONG", 2_000_000, 120_000e6, 78, block.timestamp + 7 days
        );
        vm.stopPrank();

        vm.prank(resolver);
        market.autoResolveSignal(0, 121_000e6, "https://example.com/price");

        assertEq(usdc.balanceOf(agent), 9_960_000);
        assertEq(usdc.balanceOf(treasury), 40_000);
        (uint256 signals, uint256 wins,,, uint256 rewards) = market.agentStats(agent);
        assertEq(signals, 1);
        assertEq(wins, 1);
        assertEq(rewards, 1_960_000);
    }

    function testAutoResolveLosingLongPaysProtocolAndResolver() external {
        market.initializeV2(treasury, resolver, 200, 500);

        vm.startPrank(agent);
        usdc.approve(address(market), 2_000_000);
        market.publishSignal(
            "Macro Scout", "BTC-USD", "Upside", "LONG", 2_000_000, 120_000e6, 78, block.timestamp + 7 days
        );
        vm.stopPrank();

        vm.prank(resolver);
        market.autoResolveSignal(0, 119_000e6, "https://example.com/price");

        assertEq(usdc.balanceOf(resolver), 98_000);
        assertEq(usdc.balanceOf(treasury), 1_902_000);
        assertEq(usdc.balanceOf(address(market)), 0);
        (, uint256 wins, uint256 losses,,) = market.agentStats(agent);
        assertEq(wins, 0);
        assertEq(losses, 1);
        assertEq(market.resolverRevenue(), 98_000);
    }

    function testUpgradePreservesState() external {
        vm.startPrank(agent);
        usdc.approve(address(market), 2_000_000);
        market.publishSignal(
            "Macro Scout", "BTC-USD", "Upside", "LONG", 2_000_000, 120_000e6, 78, block.timestamp + 7 days
        );
        vm.stopPrank();

        AgoraAgentMarketV2 nextImplementation = new AgoraAgentMarketV2();
        market.upgradeToAndCall(address(nextImplementation), "");

        assertEq(AgoraAgentMarketV2(address(market)).version(), 2);
        assertEq(market.nextSignalId(), 1);
        (, uint256 wins,,, uint256 rewards) = market.agentStats(agent);
        assertEq(wins, 0);
        assertEq(rewards, 0);
    }
}
