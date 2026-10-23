// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CreditRegistry (CREDIT-1 on-chain hook)
/// @notice Stores Merkle roots of off-chain CREDIT-1 score tallies. Accounts prove
///         their (given, received) scores against the latest root.
/// @dev Leaf = keccak256(bytes.concat(keccak256(abi.encode(account, given, received, epoch)))).
contract CreditRegistry {
    struct Score { uint128 given; uint128 received; uint64 epoch; }

    address public admin;
    uint64 public epoch;
    bytes32 public root;
    mapping(address => Score) public scores;

    event RootPublished(uint64 indexed epoch, bytes32 root);
    event ScoreClaimed(address indexed account, uint64 indexed epoch, uint128 given, uint128 received);
    event AdminTransferred(address indexed from, address indexed to);

    error NotAdmin();
    error BadProof();
    error StaleEpoch();

    constructor(address admin_) { admin = admin_; emit AdminTransferred(address(0), admin_); }

    modifier onlyAdmin() { if (msg.sender != admin) revert NotAdmin(); _; }

    function transferAdmin(address to) external onlyAdmin { emit AdminTransferred(admin, to); admin = to; }

    function publishRoot(bytes32 newRoot) external onlyAdmin {
        epoch += 1; root = newRoot; emit RootPublished(epoch, newRoot);
    }

    function leaf(address account, uint128 given, uint128 received, uint64 ep) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, given, received, ep))));
    }

    function claim(address account, uint128 given, uint128 received, bytes32[] calldata proof) external {
        if (!_verify(proof, root, leaf(account, given, received, epoch))) revert BadProof();
        if (scores[account].epoch >= epoch && scores[account].epoch != 0) revert StaleEpoch();
        scores[account] = Score(given, received, epoch);
        emit ScoreClaimed(account, epoch, given, received);
    }

    /// @notice Combined score used for discounts (given + received), 0 if stale.
    function scoreOf(address account) external view returns (uint256) {
        Score memory s = scores[account];
        if (s.epoch != epoch) return 0;
        return uint256(s.given) + uint256(s.received);
    }

    function givenOf(address account) external view returns (uint256) {
        Score memory s = scores[account];
        return s.epoch == epoch ? s.given : 0;
    }

    function _verify(bytes32[] calldata proof, bytes32 r, bytes32 l) internal pure returns (bool) {
        bytes32 h = l;
        for (uint256 i; i < proof.length; ++i) {
            bytes32 p = proof[i];
            h = h < p ? keccak256(abi.encode(h, p)) : keccak256(abi.encode(p, h));
        }
        return h == r;
    }
}
