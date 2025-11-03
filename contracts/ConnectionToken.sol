// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ConnectionToken
 * @dev Connection Token (CT) 合约，用于激励空投。
 */
contract ConnectionToken is ERC20, Ownable {
    constructor(uint256 initialSupply) ERC20("Connection Token", "CT") Ownable(msg.sender) {
        // 将初始供应量铸造给合约的部署者（Owner）
        _mint(msg.sender, initialSupply);
    }

    /**
     * @notice Owner 可以铸造更多 CT 代币。
     * @param to 接收代币的地址。
     * @param amount 铸造数量。
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}