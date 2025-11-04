// contracts/ConnectionToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ConnectionToken (CT)
 * @dev 总供应量永久封顶 10,000,000 CT
 */
contract ConnectionToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 10_000_000 * 1e18; // 10M CT

    event CapReached(uint256 totalSupply);

    constructor(uint256 initialSupply) 
        ERC20("Connection Token", "CT") 
        Ownable(msg.sender) 
    {
        require(initialSupply <= MAX_SUPPLY, "Initial supply > cap");
        _mint(msg.sender, initialSupply);
    }

    /**
     * @dev Owner 铸造代币（自动防超发）
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds 10M cap");
        _mint(to, amount);

        if (totalSupply() == MAX_SUPPLY) {
            emit CapReached(totalSupply());
        }
    }

    /**
     * @dev 查看当前是否已达上限
     */
    function capReached() external view returns (bool) {
        return totalSupply() >= MAX_SUPPLY;
    }

    /**
     * @dev 查看剩余可铸造量
     */
    function remainingMintable() external view returns (uint256) {
        return totalSupply() >= MAX_SUPPLY ? 0 : MAX_SUPPLY - totalSupply();
    }
}