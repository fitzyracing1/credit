// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CreditRegistry} from "../src/CreditRegistry.sol";
import {SpaceCreditRouter, IERC20} from "../src/SpaceCreditRouter.sol";

contract MockSpace {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address a, uint256 v) external { balanceOf[a] += v; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
    function transfer(address to, uint256 v) external returns (bool) { balanceOf[msg.sender] -= v; balanceOf[to] += v; return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        allowance[f][msg.sender] -= v; balanceOf[f] -= v; balanceOf[to] += v; return true;
    }
}

contract CreditTest is Test {
    CreditRegistry reg; SpaceCreditRouter router; MockSpace tok;
    address admin = address(0xA11CE); address treasury = address(0x7EA);
    address alice = address(0xA); address bob = address(0xB); address carol = address(0xC);

    function setUp() public {
        reg = new CreditRegistry(admin);
        tok = new MockSpace();
        router = new SpaceCreditRouter(IERC20(address(tok)), reg, admin, treasury);
        tok.mint(carol, 1_000_000e18);
        vm.prank(carol); tok.approve(address(router), type(uint256).max);
    }

    function _h(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    // two-leaf tree: alice(given 60, recv 40), bob(given 20, recv 0)
    function _publish() internal returns (bytes32 la, bytes32 lb) {
        la = reg.leaf(alice, 60, 40, 1); lb = reg.leaf(bob, 20, 0, 1);
        vm.prank(admin); reg.publishRoot(_h(la, lb));
    }

    function _claimBoth() internal {
        (bytes32 la, bytes32 lb) = _publish();
        bytes32[] memory p = new bytes32[](1);
        p[0] = lb; reg.claim(alice, 60, 40, p);
        p[0] = la; reg.claim(bob, 20, 0, p);
    }

    function test_onlyAdminPublishes() public {
        vm.expectRevert(CreditRegistry.NotAdmin.selector); reg.publishRoot(bytes32(uint256(1)));
    }

    function test_claimValidProof() public {
        _claimBoth();
        assertEq(reg.scoreOf(alice), 100); assertEq(reg.givenOf(bob), 20);
    }

    function test_claimBadProofReverts() public {
        (, bytes32 lb) = _publish();
        bytes32[] memory p = new bytes32[](1); p[0] = lb;
        vm.expectRevert(CreditRegistry.BadProof.selector); reg.claim(alice, 999, 40, p);
    }

    function test_scoreStaleAfterNewEpoch() public {
        _claimBoth();
        vm.prank(admin); reg.publishRoot(bytes32(uint256(7)));
        assertEq(reg.scoreOf(alice), 0);
    }

    function test_revenueShareOffByDefault() public view {
        assertFalse(router.revenueShareEnabled()); assertEq(router.revenueShareBps(), 0);
    }

    function test_syncRevertsWhenDisabled() public {
        vm.expectRevert(SpaceCreditRouter.RevenueShareDisabled.selector); router.sync();
    }

    function test_onlyAdminEnablesShare() public {
        vm.expectRevert(SpaceCreditRouter.NotAdmin.selector); router.setRevenueShare(true, 5000);
    }

    function test_baseFeeNoScore() public {
        vm.prank(carol); router.route(bob, 10_000e18);
        assertEq(tok.balanceOf(treasury), 100e18); assertEq(tok.balanceOf(bob), 9_900e18);
    }

    function test_discountForScore() public {
        _claimBoth();
        // alice score 100 => max 50% discount => 0.5% fee
        assertEq(router.feeBpsFor(alice), 50);
        assertEq(router.feeBpsFor(bob), 90); // score 20 => 10% off
        assertEq(router.feeBpsFor(carol), 100);
    }

    function test_noShareAccruesWhenDisabled() public {
        vm.prank(carol); router.route(bob, 10_000e18);
        assertEq(tok.balanceOf(address(router)), 0);
    }

    function test_revenueShareProRata() public {
        _claimBoth();
        vm.prank(admin); router.setRevenueShare(true, 5000);
        vm.prank(alice); router.sync(); // weight 60
        vm.prank(bob); router.sync();   // weight 20
        vm.prank(carol); router.route(treasury, 10_000e18); // fee 100, shared 50
        assertEq(router.claimable(alice), 37.5e18);
        assertEq(router.claimable(bob), 12.5e18);
        vm.prank(alice); router.claim();
        assertEq(tok.balanceOf(alice), 37.5e18);
    }

    function testFuzz_feeNeverExceedsBase(uint128 g, uint128 r) public {
        bytes32 l = reg.leaf(alice, g, r, 1);
        vm.prank(admin); reg.publishRoot(l);
        reg.claim(alice, g, r, new bytes32[](0));
        assertLe(router.feeBpsFor(alice), 100);
        assertGe(router.feeBpsFor(alice), 50);
    }
}
