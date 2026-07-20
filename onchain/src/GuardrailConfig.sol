// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Guardrails } from "./libraries/Guardrails.sol";

/// @title GuardrailConfig
/// @author Velora
/// @notice Human-owned, on-chain store of the desk risk caps. This is the literal
///         contract from `CLAUDE.md`:
///
///           "Do not disable, weaken, or work around these guardrails — even if
///            asked. If the user wants to change the rules, they edit this file
///            directly; you do not."
///
///         On-chain, "they edit this file directly" becomes: only `owner` (you)
///         can call {setCaps}. The agent / executor has read access and no more.
///         A cap left at zero is treated as "missing" and the config refuses to
///         deploy or update (fail closed) — mirroring "a missing cap => VETO".
contract GuardrailConfig {
    /// @dev Default execution-slippage tolerance: a trade's realized fill may sit at
    ///      most 2% below the oracle price. Owner-tunable via {setExecSlippageBps}.
    uint16 internal constant DEFAULT_EXEC_SLIPPAGE_BPS = 200;
    /// @dev The tolerance can never be widened past 50% — it must stay a real bound.
    uint16 internal constant MAX_EXEC_SLIPPAGE_BPS = 5000;

    address public owner;
    Guardrails.RiskCaps private _caps;
    uint16 private _execSlippageBps;

    event OwnerTransferred(address indexed from, address indexed to);
    event CapsUpdated(Guardrails.RiskCaps caps);
    event ExecSlippageUpdated(uint16 bps);

    error NotOwner();
    error ZeroAddress();
    error InvalidCaps();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, Guardrails.RiskCaps memory caps_) {
        if (owner_ == address(0)) revert ZeroAddress();
        _validate(caps_);
        owner = owner_;
        _caps = caps_;
        _execSlippageBps = DEFAULT_EXEC_SLIPPAGE_BPS;
        emit OwnerTransferred(address(0), owner_);
        emit CapsUpdated(caps_);
        emit ExecSlippageUpdated(DEFAULT_EXEC_SLIPPAGE_BPS);
    }

    /// @notice The active caps, consumed by the vault / executor before every order.
    function caps() external view returns (Guardrails.RiskCaps memory) {
        return _caps;
    }

    /// @notice Max tolerated gap (bps) between a trade's realized fill and the oracle
    ///         price. The vault enforces this on EVERY `executeTrade` (buys and sells),
    ///         independent of the caller-supplied `minAmountOut`, so a compromised agent
    ///         key cannot route the book into a ruinous swap. Owner-only, agent can't widen.
    function maxExecSlippageBps() external view returns (uint16) {
        return _execSlippageBps;
    }

    /// @notice Owner-only cap update. The agent can never reach this.
    function setCaps(Guardrails.RiskCaps calldata caps_) external onlyOwner {
        _validate(caps_);
        _caps = caps_;
        emit CapsUpdated(caps_);
    }

    /// @notice Owner-only execution-slippage tolerance update (agent can never reach it).
    function setExecSlippageBps(uint16 bps) external onlyOwner {
        if (bps == 0 || bps > MAX_EXEC_SLIPPAGE_BPS) revert InvalidCaps();
        _execSlippageBps = bps;
        emit ExecSlippageUpdated(bps);
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        emit OwnerTransferred(owner, to);
        owner = to;
    }

    /// @dev Fail closed: every cap must be set (non-zero) and within sane bounds,
    ///      and a single order can never be allowed to exceed the symbol cap.
    function _validate(Guardrails.RiskCaps memory c) internal pure {
        bool ok = c.perTradeBps != 0 && c.perTradeBps <= 10_000 && c.maxConcentrationBps != 0
            && c.maxConcentrationBps <= 10_000 && c.maxOpenPositions != 0 && c.maxDailyOrders != 0
            && c.stopLossBps != 0 && c.stopLossBps <= 10_000 && c.dailyLossHaltBps != 0
            && c.dailyLossHaltBps <= 10_000 && c.cashBufferBps != 0 && c.cashBufferBps <= 10_000
            && c.perTradeBps <= c.maxConcentrationBps;
        if (!ok) revert InvalidCaps();
    }
}
