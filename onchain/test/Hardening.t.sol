// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RWAVault } from "../src/RWAVault.sol";
import { GuardrailConfig } from "../src/GuardrailConfig.sol";
import { Guardrails } from "../src/libraries/Guardrails.sol";
import { IPriceOracle, ISwapAdapter } from "../src/interfaces/IVaultPeriphery.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockERC20, MockOracle, MockSwapAdapter } from "../src/mocks/Mocks.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { SessionKeyExecutor } from "../src/SessionKeyExecutor.sol";
import { DeskRegistry } from "../src/DeskRegistry.sol";

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

    // ───────────────────────── MEDIUM — Pausable circuit breaker ─────────────────────────

    function test_pause_blocksDeposit_butNotWithdraw() public {
        vm.prank(HUMAN);
        vault.pause();
        assertEq(vault.maxDeposit(ALICE), 0);

        usdg.mint(ALICE, 10e18);
        vm.startPrank(ALICE);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(10e18, ALICE);
        vault.withdraw(5e18, ALICE, ALICE); // exit stays open while paused
        vm.stopPrank();

        vm.prank(HUMAN);
        vault.unpause();
        vm.prank(ALICE);
        vault.deposit(10e18, ALICE); // works again once unpaused
    }

    function test_pause_blocksTrading_ownerOnly() public {
        vm.prank(MANAGER);
        vm.expectRevert(); // Ownable: not owner
        vault.pause();

        vm.prank(HUMAN);
        vault.pause();
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 10e18,
            minAmountOut: 0,
            stopPriceE18: PRICE * 90 / 100,
            leftSideException: false
        });
        vm.prank(MANAGER);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.executeTrade(o);
    }

    // ─────────────────────── MEDIUM — daily halt counts overnight gaps (M1) ───────────────────────

    function test_halt_countsOvernightGap() public {
        _buy(10e18); // day 1: position on; lastNav ~100 recorded
        vm.warp(block.timestamp + 1 days); // next day
        oracle.setPrice(address(stk), PRICE * 40 / 100); // book gaps down overnight (~-6%)

        // Baseline carries yesterday's NAV (not the post-gap value), so the halt latches...
        vault.latchHalt();
        assertEq(vault.haltedDay(), block.timestamp / 1 days);

        // ...and a fresh buy today is blocked. (Old code re-based to the gapped NAV → no halt.)
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(stk),
            isBuy: true,
            amountIn: 1e18,
            minAmountOut: 0,
            stopPriceE18: 18e18,
            leftSideException: false
        });
        assertEq(uint256(vault.previewTrade(o)), uint256(Guardrails.Violation.DailyLossHalt));
    }

    function test_vault_ownership_isTwoStep() public {
        address NEW = address(0xBEEF);
        vm.prank(HUMAN);
        vault.transferOwnership(NEW);
        assertEq(vault.owner(), HUMAN); // not transferred yet
        assertEq(vault.pendingOwner(), NEW);
        vm.prank(NEW);
        vault.acceptOwnership();
        assertEq(vault.owner(), NEW);
    }

    // ─────────────────────── MEDIUM — session re-grant clears stale scope (M3) ───────────────────────

    function test_session_regrant_clearsStaleTokenScope() public {
        SessionKeyExecutor exec = new SessionKeyExecutor(vault, HUMAN);
        address AGENT = address(0xA9E7);
        address[] memory two = new address[](2);
        two[0] = address(stk);
        two[1] = address(other);
        address[] memory one = new address[](1);
        one[0] = address(stk);

        vm.startPrank(HUMAN);
        vault.setManager(address(exec));
        exec.grantSession(
            AGENT, uint64(block.timestamp + 7 days), 1000e18, 10, 100_000e18, true, true, two
        );
        vm.stopPrank();
        assertTrue(exec.tokenAllowed(AGENT, address(other)));

        // Re-grant a NARROWER scope; `other` must no longer be in scope.
        vm.prank(HUMAN);
        exec.grantSession(
            AGENT, uint64(block.timestamp + 7 days), 1000e18, 10, 100_000e18, true, true, one
        );
        assertFalse(exec.tokenAllowed(AGENT, address(other)));
        assertTrue(exec.tokenAllowed(AGENT, address(stk)));

        // A real trade on the stale token is rejected by the executor.
        RWAVault.TradeOrder memory o = RWAVault.TradeOrder({
            stockToken: address(other),
            isBuy: true,
            amountIn: 1e18,
            minAmountOut: 0,
            stopPriceE18: PRICE * 90 / 100,
            leftSideException: false
        });
        vm.prank(AGENT);
        vm.expectRevert(SessionKeyExecutor.TokenNotInSession.selector);
        exec.trade(o);
    }

    // ─────────────────────── MEDIUM — attestSelf can't be squatted (M6) ───────────────────────

    function test_attestSelf_cannotBeSquatted() public {
        DeskRegistry reg = new DeskRegistry();
        bytes32 label = keccak256("velora-vault:0xVAULT");
        address VICTIM = address(0x1111);
        address ATTACKER = address(0x2222);
        bytes32 subj = reg.subjectFor(VICTIM, label);

        // Attacker front-runs, claiming the victim's derived subject via RAW attest.
        vm.prank(ATTACKER);
        reg.attest(subj, 1, 999e18, 0, bytes32(0), ""); // lands in the raw namespace only

        // Victim still owns its squat-proof self-subject, and its record wins on read.
        vm.prank(VICTIM);
        reg.attestSelf(label, 1, 100e18, 0, bytes32(0), "");
        assertEq(reg.selfAttesterOf(subj), VICTIM);
        assertEq(reg.count(subj), 1);
        assertEq(reg.latest(subj).nav, 100e18); // victim's, not the attacker's 999e18
    }
}
