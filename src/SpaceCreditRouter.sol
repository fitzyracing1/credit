// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CreditRegistry} from "./CreditRegistry.sol";

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/// @title SpaceCreditRouter
/// @notice Fee-taking transfer router for SPACE (space-money SpaceToken, mainnet
///         0x0af05969C412Dc1E07be5fC5A4e141214aAe846e) with two CREDIT-1 benefits:
///         (a) fee discount by credit score — ON;
///         (b) revenue share to credit-givers — OFF BY DEFAULT.
/// @dev WARNING: Enabling revenue share may cause credits to be treated as an
///      investment contract / security under applicable law (e.g. the Howey test).
///      Obtain legal review BEFORE calling setRevenueShare(true, ...).
///      This contract is NOT deployed anywhere; tests run on local anvil only.
contract SpaceCreditRouter {
    IERC20 public immutable token;
    CreditRegistry public immutable registry;
    address public admin;
    address public treasury;

    uint16 public constant BPS = 10_000;
    uint16 public baseFeeBps = 100;          // 1%
    uint16 public maxDiscountBps = 5_000;    // up to 50% off the fee
    uint256 public scoreForMaxDiscount = 100;

    // ---- revenue share (OFF by default) ----
    bool public revenueShareEnabled;         // false
    uint16 public revenueShareBps;           // share of each fee to givers pool
    uint256 public totalWeight;
    uint256 public accPerWeight;             // scaled 1e18
    mapping(address => uint256) public weight;
    mapping(address => uint256) public debt;
    mapping(address => uint256) public pending;

    event Routed(address indexed from, address indexed to, uint256 amount, uint256 fee, uint256 shared);
    event RevenueShareSet(bool enabled, uint16 bps);
    event Claimed(address indexed account, uint256 amount);

    error NotAdmin();
    error BadParam();
    error RevenueShareDisabled();

    constructor(IERC20 token_, CreditRegistry registry_, address admin_, address treasury_) {
        token = token_; registry = registry_; admin = admin_; treasury = treasury_;
    }

    modifier onlyAdmin() { if (msg.sender != admin) revert NotAdmin(); _; }

    function setFees(uint16 base, uint16 maxDisc, uint256 scoreMax) external onlyAdmin {
        if (base > 1_000 || maxDisc > BPS || scoreMax == 0) revert BadParam();
        baseFeeBps = base; maxDiscountBps = maxDisc; scoreForMaxDiscount = scoreMax;
    }

    /// @notice LEGAL REVIEW REQUIRED before enabling. See SPEC.md §8.
    function setRevenueShare(bool enabled, uint16 bps) external onlyAdmin {
        if (bps > BPS) revert BadParam();
        revenueShareEnabled = enabled; revenueShareBps = bps;
        emit RevenueShareSet(enabled, bps);
    }

    function feeBpsFor(address account) public view returns (uint256) {
        uint256 s = registry.scoreOf(account);
        if (s > scoreForMaxDiscount) s = scoreForMaxDiscount;
        uint256 discount = uint256(maxDiscountBps) * s / scoreForMaxDiscount;
        return uint256(baseFeeBps) * (BPS - discount) / BPS;
    }

    function route(address to, uint256 amount) external {
        uint256 fee = amount * feeBpsFor(msg.sender) / BPS;
        uint256 shared;
        if (revenueShareEnabled && totalWeight > 0) {
            shared = fee * revenueShareBps / BPS;
            accPerWeight += shared * 1e18 / totalWeight;
        }
        require(token.transferFrom(msg.sender, to, amount - fee), "xfer");
        if (fee - shared > 0) require(token.transferFrom(msg.sender, treasury, fee - shared), "fee");
        if (shared > 0) require(token.transferFrom(msg.sender, address(this), shared), "share");
        emit Routed(msg.sender, to, amount, fee, shared);
    }

    /// @notice Sync caller's pool weight to their current credit-GIVEN score.
    function sync() external {
        if (!revenueShareEnabled) revert RevenueShareDisabled();
        _settle(msg.sender);
        uint256 w = registry.givenOf(msg.sender);
        totalWeight = totalWeight - weight[msg.sender] + w;
        weight[msg.sender] = w;
        debt[msg.sender] = w * accPerWeight / 1e18;
    }

    function claim() external {
        _settle(msg.sender);
        uint256 amt = pending[msg.sender];
        pending[msg.sender] = 0;
        if (amt > 0) require(token.transfer(msg.sender, amt), "claim");
        emit Claimed(msg.sender, amt);
    }

    function claimable(address a) external view returns (uint256) {
        return pending[a] + weight[a] * accPerWeight / 1e18 - debt[a];
    }

    function _settle(address a) internal {
        uint256 acc = weight[a] * accPerWeight / 1e18;
        pending[a] += acc - debt[a];
        debt[a] = acc;
    }
}
