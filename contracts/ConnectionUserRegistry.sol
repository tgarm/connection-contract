// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ConnectionToken.sol"; // 引入 CT 合约

/**
 * @title ConnectionUserRegistry
 * @dev 管理用户名的注册、修改、费用收取及线性空投。
 * 🚨 修正：空投简化为基于时间的线性释放，每次操作提取所有已释放量。
 */
contract ConnectionUserRegistry is Ownable {
    // ============== 状态变量 ==============

    struct UserProfile {
        bytes32 usernameHash;
        uint256 registrationTime;
    }
    
    mapping(address => UserProfile) public users;
    mapping(bytes32 => address) public usernameHashToAddress;

    // 2. 代币和费用
    ConnectionToken public ctToken;
    
    uint256 public registrationFee; // 注册费用
    uint256 public modificationFee; // 修改费用
    
    // 3. 线性空投状态变量
    uint256 public constant AIRDROP_CYCLE_DURATION = 126144000; // 约 4 年秒数
    uint256 public currentCycleStartTime;
    uint256 public currentCycleEndTime; 
    uint256 public currentCycleTotalAirdropAmount; // 当前周期空投总额
    uint256 public cumulativeCTDistributed;         // 当前周期已分发 CT 总量
    uint256 public lastAirdropTimestamp;            // 上次执行空投的区块时间戳
    
    // 🚨 移除 airdropRatioBasisPoints 状态变量 (或保留，但不在空投计算中使用)
    // 尽管测试中不再使用，为了兼容您的构造函数和 set 函数，我们保留它
    uint256 public airdropRatioBasisPoints; 

    // 4. 用户名长度限制
    uint256 public constant MIN_USERNAME_LENGTH = 3;
    uint256 public constant MAX_USERNAME_LENGTH = 32;

    // ============== 事件 (保持不变) ==============

    event UsernameRegistered(address indexed user, bytes32 usernameHash, uint256 feePaid);
    event UsernameModified(address indexed user, bytes32 newUsernameHash, uint256 feePaid);
    event AirdropCycleStarted(uint256 cycleStartTime, uint256 cycleEndTime, uint256 totalAmount);
    event AirdropExecuted(address indexed recipient, uint256 ai3Paid, uint256 ctAmount);

    // ============== 构造函数 (保持不变) ==============

    constructor(
        address _ctTokenAddress,
        uint256 _initialRegFee,
        uint256 _initialModFee,
        uint256 _initialAirdropRatio // 仍然接收这个参数
    ) 
    Ownable(msg.sender)
    {
        ctToken = ConnectionToken(_ctTokenAddress);
        registrationFee = _initialRegFee;
        modificationFee = _initialModFee;
        airdropRatioBasisPoints = _initialAirdropRatio;
    }
    
    // ============== Owner 管理函数 (保持不变) ==============
    
    function setRegistrationFee(uint256 newFee) public onlyOwner {
        registrationFee = newFee;
    }

    function setModificationFee(uint256 newFee) public onlyOwner {
        modificationFee = newFee;
    }
    
    function setAirdropRatio(uint256 newRatio) public onlyOwner {
        require(newRatio <= 10000, "Ratio cannot exceed 100%");
        airdropRatioBasisPoints = newRatio;
    }

    function startNewAirdropCycle(uint256 _totalAmount, uint256 _initialAirdropRatio) public onlyOwner {
        require(_totalAmount > 0, "Amount must be positive");
        require(_initialAirdropRatio <= 10000, "Ratio cannot exceed 100%"); // 仍然要求比例有效
        
        uint256 contractBalance = ctToken.balanceOf(address(this));
        require(_totalAmount <= contractBalance, "Insufficient CT balance for the cycle");
        
        currentCycleStartTime = block.timestamp;
        currentCycleEndTime = block.timestamp + AIRDROP_CYCLE_DURATION;
        currentCycleTotalAirdropAmount = _totalAmount;
        cumulativeCTDistributed = 0; 
        lastAirdropTimestamp = block.timestamp; 
        airdropRatioBasisPoints = _initialAirdropRatio; // 仍然保存这个值
        
        emit AirdropCycleStarted(currentCycleStartTime, currentCycleEndTime, _totalAmount);
    }

    function withdrawAI3() public onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "AI3 transfer failed");
    }
    
    // ============== 核心逻辑函数 (保持不变) ==============

    function registerUsername(string memory _username) public payable {
        require(msg.value >= registrationFee, "Insufficient registration fee");
        require(users[msg.sender].registrationTime == 0, "User already registered");
        
        bytes32 usernameHash = _validateAndHashUsername(_username);
        
        users[msg.sender] = UserProfile(usernameHash, block.timestamp);
        usernameHashToAddress[usernameHash] = msg.sender;
        
        _executeAirdrop(msg.value);

        emit UsernameRegistered(msg.sender, usernameHash, msg.value);
    }

    function modifyUsername(string memory _newUsername) public payable {
        require(users[msg.sender].registrationTime != 0, "User not registered");
        require(msg.value >= modificationFee, "Insufficient modification fee");
        
        bytes32 newUsernameHash = _validateAndHashUsername(_newUsername);
        
        bytes32 oldUsernameHash = users[msg.sender].usernameHash;
        delete usernameHashToAddress[oldUsernameHash];
        
        users[msg.sender].usernameHash = newUsernameHash;
        usernameHashToAddress[newUsernameHash] = msg.sender;
        
        _executeAirdrop(msg.value);

        emit UsernameModified(msg.sender, newUsernameHash, msg.value);
    }

    // ============== 内部辅助函数 ==============
    function _validateAndHashUsername(string memory _username) internal view returns (bytes32) {
        bytes memory usernameBytes = bytes(_username);
        require(usernameBytes.length >= MIN_USERNAME_LENGTH && usernameBytes.length <= MAX_USERNAME_LENGTH, "Invalid length");
        
        bytes32 usernameHash = keccak256(usernameBytes);
        
        require(usernameHashToAddress[usernameHash] == address(0), "Username already taken");
        
        return usernameHash;
    }

    function _executeAirdrop(uint256 ai3Paid) internal {
        // 检查空投周期是否有效或已结束
        if (block.timestamp >= currentCycleEndTime || currentCycleTotalAirdropAmount == 0) {
            return; 
        }
        
        // 1. 计算自上次空投以来应释放的总 CT 量
        uint256 timeElapsed = block.timestamp - lastAirdropTimestamp;
        
        // 🚨 关键：同一区块内，timeElapsed = 0，直接返回
        if (timeElapsed == 0) return; 

        // 线性释放计算
        uint256 totalCTToRelease = timeElapsed * currentCycleTotalAirdropAmount / AIRDROP_CYCLE_DURATION;

        // 2. 限制释放量不超过周期剩余总量
        uint256 remainingInCycle = currentCycleTotalAirdropAmount - cumulativeCTDistributed;
        
        if (totalCTToRelease > remainingInCycle) {
            totalCTToRelease = remainingInCycle;
        }
        
        // 3. 🚨 核心简化：本次操作领取所有已释放的 CT
        uint256 ctAmount = totalCTToRelease; 

        // 4. 执行转账和状态更新
        if (ctAmount > 0) {
            uint256 contractBalance = ctToken.balanceOf(address(this));
            if (ctAmount > contractBalance) {
                ctAmount = contractBalance; 
            }
            
            ctToken.transfer(msg.sender, ctAmount);
            
            // 更新空投进度和时间戳
            cumulativeCTDistributed += ctAmount;
            lastAirdropTimestamp = block.timestamp; 

            emit AirdropExecuted(msg.sender, ai3Paid, ctAmount);
        }
        
        // 5. 如果周期已经结束
        if (cumulativeCTDistributed >= currentCycleTotalAirdropAmount) {
             lastAirdropTimestamp = block.timestamp;
        }
    }
}