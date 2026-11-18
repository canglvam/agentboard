// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title MockAgentId — TESTNET-ONLY mock of the SPACE ID Agent ID registry
/// @notice Same balanceOf interface as the real registry, plus mintable test
/// IDs with a .ai name stored in tokenURI metadata so the frontend name
/// resolution path can be tested end to end.
/// @dev NEVER deploy on mainnet. Mainnet uses the real registry:
/// 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
contract MockAgentId is ERC721Enumerable {
    using Strings for uint256;

    mapping(uint256 => string) private _names;

    constructor() ERC721("Agent ID", "AI") {}

    function mint(address to, uint256 tokenId, string calldata name_) external {
        _names[tokenId] = name_;
        _safeMint(to, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name":"',
                        _names[tokenId],
                        '","description":"Mock Agent ID for testing (testnet only)","image":""}'
                    )
                )
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", json));
    }
}
