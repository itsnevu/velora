// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DeskRegistry — Proof-of-Track-Record
/// @author Velora
/// @notice Append-only, chain-stamped attestation log for an AI trading desk.
///         After each desk run the operator commits a compact snapshot (NAV,
///         cumulative realized P&L, and a hash of the full `desk-state.json`).
///         Because records are append-only, epoch-monotonic, and timestamped by
///         the chain, a desk cannot backdate or rewrite its history — turning a
///         self-reported "we made money" into something anyone can verify.
///
/// @dev    Honesty note (a registry cannot fix everything): it proves what WAS
///         attested and WHEN, but not that a desk attested *every* period. Gaps
///         are visible on-chain; consumers should treat a sparse or irregular log
///         as a yellow flag. Regular cadence is the desk's reputation to keep.
contract DeskRegistry {
    struct Attestation {
        uint64 epoch; //          desk-defined period id; must strictly increase per subject
        uint64 timestamp; //      block.timestamp — chain-stamped, cannot be backdated
        uint256 nav; //           account/vault NAV at snapshot (accounting units, 18 dec)
        int256 realizedPnl; //    cumulative realized P&L (signed)
        bytes32 snapshotHash; //  keccak256 of the full off-chain desk-state.json
        string uri; //            optional pointer (ipfs/https) to the snapshot
    }

    /// @notice The desk that owns (may append to) a subject. Set on first attestation.
    mapping(bytes32 => address) public attesterOf;

    mapping(bytes32 => Attestation[]) private _log;

    event SubjectRegistered(bytes32 indexed subject, address indexed attester);
    event Attested(
        bytes32 indexed subject,
        uint256 indexed index,
        uint64 epoch,
        uint256 nav,
        int256 realizedPnl,
        bytes32 snapshotHash
    );

    error EmptySubject();
    error ZeroNav();
    error NotSubjectAttester();
    error EpochNotIncreasing();
    error NoData();

    /// @notice Append one attestation for `subject`. The first caller claims the
    ///         subject; only that address may append afterwards.
    /// @param subject       Stable id for the account/vault (e.g. keccak of its address/label).
    /// @param epoch         Monotonic period id; must be strictly greater than the last.
    /// @param nav           NAV at snapshot; must be > 0.
    /// @param realizedPnl   Cumulative realized P&L (signed).
    /// @param snapshotHash  keccak256 of the full off-chain snapshot for verification.
    /// @param uri           Optional off-chain pointer to the snapshot.
    function attest(
        bytes32 subject,
        uint64 epoch,
        uint256 nav,
        int256 realizedPnl,
        bytes32 snapshotHash,
        string calldata uri
    ) external returns (uint256 index) {
        if (subject == bytes32(0)) revert EmptySubject();
        if (nav == 0) revert ZeroNav();

        address owner = attesterOf[subject];
        if (owner == address(0)) {
            attesterOf[subject] = msg.sender;
            emit SubjectRegistered(subject, msg.sender);
        } else if (owner != msg.sender) {
            revert NotSubjectAttester();
        }

        Attestation[] storage log = _log[subject];
        if (log.length != 0 && epoch <= log[log.length - 1].epoch) {
            revert EpochNotIncreasing();
        }

        index = log.length;
        log.push(
            Attestation({
                epoch: epoch,
                timestamp: uint64(block.timestamp),
                nav: nav,
                realizedPnl: realizedPnl,
                snapshotHash: snapshotHash,
                uri: uri
            })
        );
        emit Attested(subject, index, epoch, nav, realizedPnl, snapshotHash);
    }

    // ------------------------------------------------------------------ reads

    function count(bytes32 subject) external view returns (uint256) {
        return _log[subject].length;
    }

    function at(bytes32 subject, uint256 i) external view returns (Attestation memory) {
        return _log[subject][i];
    }

    function latest(bytes32 subject) external view returns (Attestation memory) {
        Attestation[] storage l = _log[subject];
        if (l.length == 0) revert NoData();
        return l[l.length - 1];
    }

    /// @notice NAV + timestamp series for a subject, oldest-first. Feeds {PerfScore}.
    function series(bytes32 subject)
        external
        view
        returns (uint256[] memory navs, uint64[] memory ts)
    {
        Attestation[] storage l = _log[subject];
        uint256 n = l.length;
        navs = new uint256[](n);
        ts = new uint64[](n);
        for (uint256 i = 0; i < n; ++i) {
            navs[i] = l[i].nav;
            ts[i] = l[i].timestamp;
        }
    }
}
