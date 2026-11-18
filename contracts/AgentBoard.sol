// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title AgentBoard — the .ai reputation board
/// @notice Agent ID holders check in once a day (free, gas only), build a
/// public streak tied to their soulbound Agent ID, claim one free badge NFT,
/// and tip other Agent ID holders by address. The Agent ID IS the account:
/// no email, no signup, no off-chain database.
/// @dev Gate primitive (per the official hackathon announcement): the Agent ID
/// registry is a SPACE ID ERC-721; an address holds an Agent ID iff
/// balanceOf(address) > 0. Mainnet registry:
/// 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
/// Owner powers: ONLY pause()/unpause() for emergencies. There is NO
/// withdraw function — tips forward 100% of msg.value immediately and the
/// contract never holds user funds.
contract AgentBoard is ERC721, Ownable, Pausable, ReentrancyGuard {
    using Strings for uint256;

    IAgentIdRegistry public immutable agentIdRegistry;

    uint256 public constant DAY = 1 days;
    uint256 public constant MAX_TIP_MESSAGE_LENGTH = 280;

    mapping(address => uint256) public lastCheckInDay;
    mapping(address => uint256) public streak;
    mapping(address => uint256) public totalCheckIns;
    mapping(address => bool) public hasBadge;
    mapping(address => uint256) public badgeTokenId;

    uint256 private _nextTokenId = 1;

    event CheckIn(address indexed user, uint256 day, uint256 streak, uint256 totalCheckIns);
    event BadgeClaimed(address indexed user, uint256 indexed tokenId);
    event Tip(address indexed from, address indexed to, uint256 amount, string message);

    error NeedAgentId();
    error AlreadyCheckedInToday();
    error BadgeAlreadyClaimed();
    error TipValueZero();
    error TipMessageTooLong();
    error TipForwardFailed();

    modifier onlyAgentIdHolder() {
        if (agentIdRegistry.balanceOf(msg.sender) == 0) revert NeedAgentId();
        _;
    }

    constructor(address _agentIdRegistry) ERC721("AgentBoard Badge", "ABDG") Ownable(msg.sender) {
        require(_agentIdRegistry != address(0), "Registry address zero");
        agentIdRegistry = IAgentIdRegistry(_agentIdRegistry);
    }

    /// @notice Whether an address holds an Agent ID (balanceOf > 0).
    function hasAgentId(address account) external view returns (bool) {
        return agentIdRegistry.balanceOf(account) > 0;
    }

    /// @notice Public reputation stats for one address.
    function getStats(address account)
        external
        view
        returns (uint256 _streak, uint256 _totalCheckIns, uint256 _lastCheckInDay, bool _hasBadge)
    {
        return (streak[account], totalCheckIns[account], lastCheckInDay[account], hasBadge[account]);
    }

    /// @notice Daily check-in. Once per UTC day. Streak increments only on
    /// consecutive days; a missed day resets the streak to 1.
    function checkIn() external whenNotPaused onlyAgentIdHolder {
        uint256 day = block.timestamp / DAY;
        if (lastCheckInDay[msg.sender] == day) revert AlreadyCheckedInToday();
        if (lastCheckInDay[msg.sender] == day - 1) {
            streak[msg.sender] += 1;
        } else {
            streak[msg.sender] = 1;
        }
        lastCheckInDay[msg.sender] = day;
        totalCheckIns[msg.sender] += 1;
        emit CheckIn(msg.sender, day, streak[msg.sender], totalCheckIns[msg.sender]);
    }

    /// @notice Claim the one free commemorative badge (on-chain SVG, no IPFS).
    function claimBadge() external whenNotPaused onlyAgentIdHolder {
        if (hasBadge[msg.sender]) revert BadgeAlreadyClaimed();
        uint256 tokenId = _nextTokenId++;
        hasBadge[msg.sender] = true;
        badgeTokenId[msg.sender] = tokenId;
        _safeMint(msg.sender, tokenId);
        emit BadgeClaimed(msg.sender, tokenId);
    }

    /// @notice Tip another Agent ID holder. 100% of msg.value is forwarded
    /// immediately; the contract keeps no fee and holds no funds.
    /// Both sender and recipient must hold an Agent ID.
    function tip(address to, string calldata message) external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert TipValueZero();
        if (bytes(message).length > MAX_TIP_MESSAGE_LENGTH) revert TipMessageTooLong();
        if (agentIdRegistry.balanceOf(msg.sender) == 0) revert NeedAgentId();
        if (agentIdRegistry.balanceOf(to) == 0) revert NeedAgentId();
        (bool ok, ) = payable(to).call{value: msg.value}("");
        if (!ok) revert TipForwardFailed();
        emit Tip(msg.sender, to, msg.value, message);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice On-chain SVG badge metadata (data URI, no external dependency).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Badge does not exist");
        string memory svg = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#0b0e11"/><rect x="20" y="20" width="360" height="360" rx="24" fill="none" stroke="#f0b90b" stroke-width="4"/><text x="200" y="120" font-family="sans-serif" font-size="28" fill="#f0b90b" text-anchor="middle">AgentBoard</text><text x="200" y="180" font-family="sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">Agent ID Badge</text><text x="200" y="240" font-family="sans-serif" font-size="48" fill="#f0b90b" text-anchor="middle">#',
                tokenId.toString(),
                '</text><text x="200" y="300" font-family="sans-serif" font-size="14" fill="#848e9c" text-anchor="middle">One per Agent ID. Soulbound reputation.</text></svg>'
            )
        );
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name":"AgentBoard Badge #',
                        tokenId.toString(),
                        '","description":"Commemorative badge for Agent ID holders on AgentBoard. One per Agent ID, minted free.","image":"data:image/svg+xml;base64,',
                        Base64.encode(bytes(svg)),
                        '"}'
                    )
                )
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", json));
    }
}
