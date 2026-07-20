// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { Guardrails } from "../src/libraries/Guardrails.sol";
import { IPriceOracle, ISwapAdapter } from "../src/interfaces/IVaultPeriphery.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../src/mocks/Mocks.sol";

/// @notice Regression tests for the audit HIGH findings:
///   H1 — a trade's realized fill is bounded to the ORACLE price, independent of the
///        caller's `minAmountOut`, so a compromised manager can't bleed the vault via a
///        bad/attacker-controlled fill. Applies to buys AND sells.
///   H2 — a single stale/missing feed on a zero-balance (or dust) token can't brick
///        `navUsdg()` and therefore the whole ERC-4626 deposit/withdraw surface.
contract HardeningTest is Test {
    MockERC20 usdg;
    MockERC20 stk;
    MockERC20 other; // a second allowlisted token we never actually buy
    MockOracle oracle;
    MockSwapAdapter adapter;
    GuardrailConfig cfg;
    RWAVault vault;

    address HUMAN = address(0xB00D);
    address MANAGER = address(0x1234);
    address ALICE = address(0xA11CE);

    uint256 constant PRICE = 50e18;

    function _caps() internal pure returns (Guardrails.RiskCaps memory) {
        return Guardrails.RiskCaps({
            perTradeBps: 1500,
            maxConcentrationBps: 2500,
            maxOpenPositions: 6,
            maxDailyOrders: 4,
            stopLossBps: 800,
            dailyLossHaltBps: 500,
            cashBufferBps: 1000
        });
    }

    function setUp() public {
        usdg = new MockERC20("USD Global", "USDG");
        stk = new MockERC20("Demo Stock Token", "dSTK");
        other = new MockERC20("Other Stock Token", "oSTK");
        oracle = new MockOracle();
        oracle.setPrice(address(stk), PRICE);
        oracle.setPrice(address(other), PRICE);
        adapter = new MockSwapAdapter(oracle);
        cfg = new GuardrailConfig(HUMAN, _caps());

        vault = new RWAVault(
            IERC20(address(usdg)),
            "Velora RWA Vault",
            "vRWA",
            HUMAN,
            cfg,
            IPriceOracle(address(oracle)),
            ISwapAdapter(address(adapter)),
            MANAGER
        );

        vm.startPrank(HUMAN);
        vault.allowToken(address(stk));
        vault.allowToken(address(other));
        vm.stopPrank();

        usdg.mint(address(adapter), 1_000_000e18);
        stk.mint(address(adapter), 1_000_000e18);

        usdg.mint(ALICE, 100e18);
        vm.startPrank(ALICE);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(100e18, ALICE);
        vm.stopPrank();

        vm.warp(2_000_000_000);
    }

    function _buy(uint256 amountIn) internal returns (uint256) {
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: amountIn,
            minAmountOut: 0,
            stopPriceE18: PRICE * 90 / 100,
            leftSideException: false
        });
        vm.prank(MANAGER);
        return vault.executeTrade(o);
    }

    function _sell(uint256 amountIn) internal returns (uint256) {
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: false,
            amountIn: amountIn,
            minAmountOut: 0,
            stopPriceE18: 0,
            leftSideException: false
        });
        vm.prank(MANAGER);
        return vault.executeTrade(o);
    }

    // ───────────────────────── H1 — execution price is oracle-bounded ─────────────────────────

    function test_default_execSlippage_is_2pct() public view {
        assertEq(cfg.maxExecSlippageBps(), 200);
    }

    /// A fill within tolerance (1% haircut < 2% cap) is fine even with minAmountOut = 0.
    function test_buy_withinTolerance_ok() public {
        adapter.setSlippage(100); // 1%
        uint256 out = _buy(10e18);
        assertGt(out, 0);
    }

    /// The KEY fix: a bad fill (3% > 2% cap) reverts, even though minAmountOut = 0
    /// would have let it through the old code. The agent can't self-authorize the loss.
    function test_buy_badFill_reverts_despiteZeroMinOut() public {
        adapter.setSlippage(300); // 3%
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 10e18,
            minAmountOut: 0,
            stopPriceE18: PRICE * 90 / 100,
            leftSideException: false
        });
        vm.prank(MANAGER);
        vm.expectRevert(RWAVault.ExecSlippage.selector);
        vault.executeTrade(o);
    }

    /// Sells are bounded too — closing the "unguarded sell drain" (MEDIUM-2).
    function test_sell_badFill_reverts_despiteZeroMinOut() public {
        adapter.setSlippage(0);
        _buy(10e18); // acquire a position to sell
        uint256 held = stk.balanceOf(address(vault));
        assertGt(held, 0);

        adapter.setSlippage(300); // 3% on the way out
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: false,
            amountIn: held,
            minAmountOut: 0,
            stopPriceE18: 0,
            leftSideException: false
        });
        vm.prank(MANAGER);
        vm.expectRevert(RWAVault.ExecSlippage.selector);
        vault.executeTrade(o);
    }

    /// Owner can tighten the bound; agent (manager) cannot touch it.
    function test_execSlippage_ownerOnly() public {
        vm.prank(MANAGER);
        vm.expectRevert(GuardrailConfig.NotOwner.selector);
        cfg.setExecSlippageBps(50);

        vm.prank(HUMAN);
        cfg.setExecSlippageBps(50); // tighten to 0.5%
        assertEq(cfg.maxExecSlippageBps(), 50);

        adapter.setSlippage(100); // 1% now exceeds the 0.5% cap
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 10e18,
            minAmountOut: 0,
            stopPriceE18: PRICE * 90 / 100,
            leftSideException: false
        });
        vm.prank(MANAGER);
        vm.expectRevert(RWAVault.ExecSlippage.selector);
        vault.executeTrade(o);
    }

    function test_execSlippage_cannotBeNeutered() public {
        vm.startPrank(HUMAN);
        vm.expectRevert(GuardrailConfig.InvalidCaps.selector);
        cfg.setExecSlippageBps(0); // no bound => rejected
        vm.expectRevert(GuardrailConfig.InvalidCaps.selector);
        cfg.setExecSlippageBps(6000); // > 50% => rejected
        vm.stopPrank();
    }

    // ───────────────────────── H2 — one bad feed can't brick the vault ─────────────────────────

    /// A zero-balance allowlisted token whose feed has died is skipped in NAV, so
    /// deposits/withdrawals keep working. (Old code priced every allowlisted token.)
    function test_nav_resilient_to_deadFeed_on_zeroBalance_token() public {
        oracle.setRevert(address(other), true); // `other` feed dies; vault holds 0 of it

        // NAV still readable, deposits/withdrawals still work.
        uint256 nav = vault.navUsdg();
        assertEq(nav, 100e18);

        usdg.mint(ALICE, 10e18);
        vm.startPrank(ALICE);
        vault.deposit(10e18, ALICE);
        vault.withdraw(5e18, ALICE, ALICE);
        vm.stopPrank();
    }

    /// A token can't be allowlisted before it has a working price feed.
    function test_allowToken_requiresFeed() public {
        MockERC20 noFeed = new MockERC20("No Feed", "nFEED");
        oracle.setRevert(address(noFeed), true);
        vm.prank(HUMAN);
        vm.expectRevert(MockOracle.FeedDown.selector);
        vault.allowToken(address(noFeed));
    }

    /// redeemInKind is the always-solvent exit and uses raw balances only — it must
    /// keep working even when an oracle feed is down.
    function test_redeemInKind_worksWhenFeedDown() public {
        oracle.setRevert(address(other), true);
        uint256 shares = vault.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.redeemInKind(shares, ALICE);
        assertEq(vault.balanceOf(ALICE), 0);
        assertEq(usdg.balanceOf(ALICE), 100e18); // got all cash back (no stock held yet)
    }
}
