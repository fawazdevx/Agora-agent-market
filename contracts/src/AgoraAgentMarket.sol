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

    bool private v2Initialized;
    address public feeRecipient;
    address public resolver;
    uint256 public protocolFeeBps;
    uint256 public resolverFeeBps;
    uint256 public protocolRevenue;
    uint256 public resolverRevenue;

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
    event ProtocolConfigUpdated(address indexed feeRecipient, address indexed resolver, uint256 protocolFeeBps, uint256 resolverFeeBps);
    event ProtocolFeeCollected(uint256 indexed signalId, address indexed payer, uint256 amount);
    event AutoResolved(uint256 indexed signalId, uint256 finalPrice, SignalStatus status);
    event ResolverPaid(uint256 indexed signalId, address indexed resolver, uint256 amount);

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

    function initializeV2(
        address initialFeeRecipient,
        address initialResolver,
        uint256 initialProtocolFeeBps,
        uint256 initialResolverFeeBps
    ) external onlyOwner {
        require(!v2Initialized, "v2 already initialized");
        v2Initialized = true;
        _setProtocolConfig(initialFeeRecipient, initialResolver, initialProtocolFeeBps, initialResolverFeeBps);
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

    function setProtocolConfig(
        address newFeeRecipient,
        address newResolver,
        uint256 newProtocolFeeBps,
        uint256 newResolverFeeBps
    ) external onlyOwner {
        _setProtocolConfig(newFeeRecipient, newResolver, newProtocolFeeBps, newResolverFeeBps);
    }

    function _setProtocolConfig(
        address newFeeRecipient,
        address newResolver,
        uint256 newProtocolFeeBps,
        uint256 newResolverFeeBps
    ) internal {
        require(newFeeRecipient != address(0), "fee recipient required");
        require(newProtocolFeeBps <= 1_000, "protocol fee too high");
        require(newResolverFeeBps <= 1_000, "resolver fee too high");
        feeRecipient = newFeeRecipient;
        resolver = newResolver;
        protocolFeeBps = newProtocolFeeBps;
        resolverFeeBps = newResolverFeeBps;
        emit ProtocolConfigUpdated(newFeeRecipient, newResolver, newProtocolFeeBps, newResolverFeeBps);
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

        signalId = nextSignalId;
        nextSignalId += 1;
        uint256 lockedStake = _collectStake(signalId, stakeAmount);
        _storeSignal(signalId, agentName, market, thesis, action, lockedStake, targetPrice, confidence, deadline);

        AgentStats storage stats = agentStats[msg.sender];
        stats.signals += 1;
        stats.stakeVolume += lockedStake;

        _emitSignalPublished(signalId, market, action, lockedStake, confidence, deadline);
    }

    function _collectStake(uint256 signalId, uint256 stakeAmount) internal returns (uint256 lockedStake) {
        uint256 protocolFee = feeRecipient == address(0) ? 0 : (stakeAmount * protocolFeeBps) / 10_000;
        lockedStake = stakeAmount - protocolFee;
        require(lockedStake >= minStake, "net stake too small");

        require(usdc.transferFrom(msg.sender, address(this), stakeAmount), "stake transfer failed");
        if (protocolFee > 0) {
            protocolRevenue += protocolFee;
            require(usdc.transfer(feeRecipient, protocolFee), "fee transfer failed");
            emit ProtocolFeeCollected(signalId, msg.sender, protocolFee);
        }
    }

    function _storeSignal(
        uint256 signalId,
        string calldata agentName,
        string calldata market,
        string calldata thesis,
        string calldata action,
        uint256 lockedStake,
        uint256 targetPrice,
        uint256 confidence,
        uint256 deadline
    ) internal {
        Signal storage signal = signals[signalId];
        signal.agent = msg.sender;
        signal.agentName = agentName;
        signal.market = market;
        signal.thesis = thesis;
        signal.action = action;
        signal.stakeAmount = lockedStake;
        signal.targetPrice = targetPrice;
        signal.confidence = confidence;
        signal.deadline = deadline;
        signal.createdAt = block.timestamp;
        signal.status = SignalStatus.Open;
    }

    function _emitSignalPublished(
        uint256 signalId,
        string calldata market,
        string calldata action,
        uint256 lockedStake,
        uint256 confidence,
        uint256 deadline
    ) internal {
        emit SignalPublished(signalId, msg.sender, market, action, lockedStake, confidence, deadline);
    }

    function resolveSignal(uint256 signalId, SignalStatus status, string calldata evidenceURI) external onlyOwner {
        _resolveSignal(signalId, status, evidenceURI, address(0));
    }

    function autoResolveSignal(uint256 signalId, uint256 finalPrice, string calldata evidenceURI) external {
        require(msg.sender == owner || msg.sender == resolver, "only resolver");
        Signal storage signal = signals[signalId];
        require(signal.createdAt != 0 || signalId < nextSignalId, "unknown signal");
        require(signal.status == SignalStatus.Open, "already resolved");
        require(block.timestamp >= signal.deadline, "deadline active");
        require(signal.targetPrice > 0, "target required");
        require(_isDirectional(signal.action), "unsupported action");

        SignalStatus status = _isWinningDirectional(signal.action, finalPrice, signal.targetPrice)
            ? SignalStatus.Won
            : SignalStatus.Lost;

        _resolveSignal(signalId, status, evidenceURI, msg.sender);
        emit AutoResolved(signalId, finalPrice, status);
    }

    function _resolveSignal(
        uint256 signalId,
        SignalStatus status,
        string calldata evidenceURI,
        address resolverPayee
    ) internal {
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
            uint256 resolverFee = resolverPayee == address(0) ? 0 : (signal.stakeAmount * resolverFeeBps) / 10_000;
            uint256 protocolShare = signal.stakeAmount - resolverFee;
            if (resolverFee > 0) {
                resolverRevenue += resolverFee;
                require(usdc.transfer(resolverPayee, resolverFee), "resolver fee failed");
                emit ResolverPaid(signalId, resolverPayee, resolverFee);
            }
            if (protocolShare > 0 && feeRecipient != address(0)) {
                protocolRevenue += protocolShare;
                require(usdc.transfer(feeRecipient, protocolShare), "protocol share failed");
            }
        } else if (status == SignalStatus.Cancelled) {
            require(usdc.transfer(signal.agent, signal.stakeAmount), "stake return failed");
            emit StakeWithdrawn(signalId, signal.agent, signal.stakeAmount);
        }

        emit SignalResolved(signalId, status, evidenceURI);
    }

    function _isDirectional(string memory action) internal pure returns (bool) {
        bytes32 value = keccak256(bytes(action));
        return value == keccak256("LONG") || value == keccak256("SHORT");
    }

    function _isWinningDirectional(string memory action, uint256 finalPrice, uint256 targetPrice) internal pure returns (bool) {
        bytes32 value = keccak256(bytes(action));
        if (value == keccak256("LONG")) {
            return finalPrice >= targetPrice;
        }
        return finalPrice <= targetPrice;
    }

    function sweepLostStake(address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "recipient required");
        require(usdc.transfer(recipient, amount), "sweep failed");
    }
}
