// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Guardrails} from "./libraries/Guardrails.sol";

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
    address public owner;
    Guardrails.RiskCaps private _caps;

    event OwnerTransferred(address indexed from, address indexed to);
    event CapsUpdated(Guardrails.RiskCaps caps);

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
        emit OwnerTransferred(address(0), owner_);
        emit CapsUpdated(caps_);
    }

    /// @notice The active caps, consumed by the vault / executor before every order.
    function caps() external view returns (Guardrails.RiskCaps memory) {
        return _caps;
    }

    /// @notice Owner-only cap update. The agent can never reach this.
    function setCaps(Guardrails.RiskCaps calldata caps_) external onlyOwner {
        _validate(caps_);
        _caps = caps_;
        emit CapsUpdated(caps_);
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        emit OwnerTransferred(owner, to);
        owner = to;
    }

    /// @dev Fail closed: every cap must be set (non-zero) and within sane bounds,
    ///      and a single order can never be allowed to exceed the symbol cap.
    function _validate(Guardrails.RiskCaps memory c) internal pure {
        bool ok = c.perTradeBps != 0 && c.perTradeBps <= 10_000
            && c.maxConcentrationBps != 0 && c.maxConcentrationBps <= 10_000
            && c.maxOpenPositions != 0 && c.maxDailyOrders != 0 && c.stopLossBps != 0
            && c.stopLossBps <= 10_000 && c.dailyLossHaltBps != 0 && c.dailyLossHaltBps <= 10_000
            && c.cashBufferBps != 0 && c.cashBufferBps <= 10_000
            && c.perTradeBps <= c.maxConcentrationBps;
        if (!ok) revert InvalidCaps();
    }
}
