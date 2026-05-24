// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AgoraAgentMarket {
    uint256 private constant IMPLEMENTATION_SLOT = 0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC;
    bytes32 private constant PROXIABLE_UUID = bytes32(IMPLEMENTATION_SLOT);
    address private immutable SELF = address(this);

    enum SignalStatus {
        Open,
        Won,
        Lost,
        Cancelled
    }

    struct Signal {
        address agent;
        string agentName;
        string market;
        string thesis;
        string action;
        uint256 stakeAmount;
        uint256 targetPrice;
        uint256 confidence;
        uint256 deadline;
        uint256 createdAt;
        SignalStatus status;
        string evidenceURI;
    }

    struct AgentStats {
        uint256 signals;
        uint256 wins;
        uint256 losses;
        uint256 stakeVolume;
        uint256 rewards;
    }

    IERC20 public usdc;
    address public owner;
    uint256 public nextSignalId;
    uint256 public minStake;
    bool private initialized;

    mapping(uint256 => Signal) public signals;
    mapping(address => AgentStats) public agentStats;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MinStakeUpdated(uint256 minStake);
    event SignalPublished(
        uint256 indexed signalId,
        address indexed agent,
        string market,
        string action,
        uint256 stakeAmount,
        uint256 confidence,
        uint256 deadline
    );
    event SignalResolved(uint256 indexed signalId, SignalStatus status, string evidenceURI);
    event StakeWithdrawn(uint256 indexed signalId, address indexed agent, uint256 amount);

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    modifier onlyProxy() {
        _onlyProxy();
        _;
    }

    modifier notDelegated() {
        _notDelegated();
        _;
    }

    event Upgraded(address indexed implementation);

    constructor() {
        initialized = true;
    }

    function initialize(address usdcAddress, uint256 initialMinStake) external {
        require(!initialized, "already initialized");
        require(usdcAddress != address(0), "usdc required");
        initialized = true;
        usdc = IERC20(usdcAddress);
        owner = msg.sender;
        minStake = initialMinStake;
        emit OwnershipTransferred(address(0), msg.sender);
        emit MinStakeUpdated(initialMinStake);
    }

    function _onlyOwner() internal view {
        require(msg.sender == owner, "only owner");
    }

    function _onlyProxy() internal view {
        require(address(this) != SELF, "must be delegatecall");
        require(_implementation() == SELF, "must be active proxy");
    }

    function _notDelegated() internal view {
        require(address(this) == SELF, "must not delegatecall");
    }

    function _implementation() internal view returns (address implementation) {
        assembly {
            implementation := sload(IMPLEMENTATION_SLOT)
        }
    }

    function proxiableUUID() external view notDelegated returns (bytes32) {
        return PROXIABLE_UUID;
    }

    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable onlyProxy onlyOwner {
        _upgradeToAndCall(newImplementation, data);
    }

    function _upgradeToAndCall(address newImplementation, bytes calldata data) internal {
        require(newImplementation.code.length > 0, "implementation required");
        require(AgoraAgentMarket(newImplementation).proxiableUUID() == PROXIABLE_UUID, "unsupported proxiableUUID");

        assembly {
            sstore(IMPLEMENTATION_SLOT, newImplementation)
        }
        emit Upgraded(newImplementation);

        if (data.length > 0) {
            (bool ok, bytes memory result) = newImplementation.delegatecall(data);
            if (!ok) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner required");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setMinStake(uint256 newMinStake) external onlyOwner {
        minStake = newMinStake;
        emit MinStakeUpdated(newMinStake);
    }

    function publishSignal(
        string calldata agentName,
        string calldata market,
        string calldata thesis,
        string calldata action,
        uint256 stakeAmount,
        uint256 targetPrice,
        uint256 confidence,
        uint256 deadline
    ) external returns (uint256 signalId) {
        require(bytes(agentName).length > 0, "agent name required");
        require(bytes(market).length > 0, "market required");
        require(bytes(thesis).length > 0, "thesis required");
        require(bytes(action).length > 0, "action required");
        require(stakeAmount >= minStake, "stake too small");
        require(confidence > 0 && confidence <= 100, "bad confidence");
        require(deadline > block.timestamp, "deadline in past");

        require(usdc.transferFrom(msg.sender, address(this), stakeAmount), "stake transfer failed");

        signalId = nextSignalId;
        nextSignalId += 1;

        signals[signalId] = Signal({
            agent: msg.sender,
            agentName: agentName,
            market: market,
            thesis: thesis,
            action: action,
            stakeAmount: stakeAmount,
            targetPrice: targetPrice,
            confidence: confidence,
            deadline: deadline,
            createdAt: block.timestamp,
            status: SignalStatus.Open,
            evidenceURI: ""
        });

        AgentStats storage stats = agentStats[msg.sender];
        stats.signals += 1;
        stats.stakeVolume += stakeAmount;

        emit SignalPublished(signalId, msg.sender, market, action, stakeAmount, confidence, deadline);
    }

    function resolveSignal(uint256 signalId, SignalStatus status, string calldata evidenceURI) external onlyOwner {
        Signal storage signal = signals[signalId];
        require(signal.createdAt != 0 || signalId < nextSignalId, "unknown signal");
        require(signal.status == SignalStatus.Open, "already resolved");
        require(status != SignalStatus.Open, "invalid status");

        signal.status = status;
        signal.evidenceURI = evidenceURI;

        AgentStats storage stats = agentStats[signal.agent];
        if (status == SignalStatus.Won) {
            stats.wins += 1;
            stats.rewards += signal.stakeAmount;
            require(usdc.transfer(signal.agent, signal.stakeAmount), "stake return failed");
            emit StakeWithdrawn(signalId, signal.agent, signal.stakeAmount);
        } else if (status == SignalStatus.Lost) {
            stats.losses += 1;
        } else if (status == SignalStatus.Cancelled) {
            require(usdc.transfer(signal.agent, signal.stakeAmount), "stake return failed");
            emit StakeWithdrawn(signalId, signal.agent, signal.stakeAmount);
        }

        emit SignalResolved(signalId, status, evidenceURI);
    }

    function sweepLostStake(address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "recipient required");
        require(usdc.transfer(recipient, amount), "sweep failed");
    }
}
