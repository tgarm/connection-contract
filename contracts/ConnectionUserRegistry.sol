// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ConnectionToken.sol";

/**
 * @title ConnectionUserRegistry
 * @dev 全球唯一用户名 + 线性空投 + 可配置费用接收者
 *      所有 airdropRatio 相关代码已彻底删除
 */
contract ConnectionUserRegistry is Ownable {
    // ============== 核心数据 ==============
    struct UserProfile {
        bytes32 usernameHash;
        uint256 registrationTime;
    }

    mapping(address => UserProfile) public users;
    mapping(bytes32 => address) public usernameHashToAddress;
    mapping(bytes32 => string) public usernameHashToString;
    address[] public allUsers;

    // ============== 代币 & 费用 ==============
    ConnectionToken public immutable ctToken;
    uint256 public registrationFee;
    uint256 public modificationFee;
    address public feeReceiver;                     // 可随时更改

    // ============== 线性空投（4 年周期） ==============
    uint256 public constant AIRDROP_CYCLE_DURATION = 126144000; // ~4 years
    uint256 public cycleStartTime;
    uint256 public cycleEndTime;
    uint256 public cycleTotalCT;        // 本周期空投总额
    uint256 public distributedCT;       // 已分发
    uint256 public lastAirdropTS;       // 上次执行时间戳

    // ============== 用户名长度 ==============
    uint256 public constant MIN_USERNAME_LENGTH = 3;
    uint256 public constant MAX_USERNAME_LENGTH = 32;

    // ============== 事件 ==============
    event UsernameRegistered(address indexed user, string username, uint256 fee);
    event UsernameModified(address indexed user, string oldName, string newName, uint256 fee);
    event AirdropCycleStarted(uint256 start, uint256 end, uint256 totalCT);
    event AirdropExecuted(address indexed user, uint256 ai3Paid, uint256 ctAmount);
    event FeeReceiverChanged(address indexed oldAddr, address indexed newAddr);
    event FeeWithdrawn(address indexed receiver, uint256 amount);

    // ============== 构造函数 ==============
    constructor(
        address _ctToken,
        uint256 _regFee,
        uint256 _modFee
    ) Ownable(msg.sender) {
        ctToken = ConnectionToken(_ctToken);
        registrationFee = _regFee;
        modificationFee = _modFee;
        feeReceiver = msg.sender;                 // 默认部署者
    }

    // ============== Owner 管理 ==============
    function setRegistrationFee(uint256 fee) external onlyOwner { registrationFee = fee; }
    function setModificationFee(uint256 fee) external onlyOwner { modificationFee = fee; }

    function setFeeReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "zero addr");
        emit FeeReceiverChanged(feeReceiver, newReceiver);
        feeReceiver = newReceiver;
    }

    function withdrawFee() external {
        require(msg.sender == owner() || msg.sender == feeReceiver, "not owner or receiver");        
        uint256 bal = address(this).balance;
        require(bal > 0, "no fee");
        emit FeeWithdrawn(feeReceiver, bal);
        (bool ok,) = payable(feeReceiver).call{value: bal}("");
        require(ok, "transfer failed");
    }

    /** 开启新一轮 4 年空投 */
    function startNewAirdropCycle(uint256 totalCT) external onlyOwner {
        require(totalCT > 0, "zero amount");
        require(ctToken.balanceOf(address(this)) >= totalCT, "insufficient CT");

        cycleStartTime = block.timestamp;
        cycleEndTime   = block.timestamp + AIRDROP_CYCLE_DURATION;
        cycleTotalCT   = totalCT;
        distributedCT  = 0;
        lastAirdropTS  = block.timestamp;

        emit AirdropCycleStarted(cycleStartTime, cycleEndTime, totalCT);
    }

    // ============== 前端查询 API ==============
    function getUsernameByAddress(address user) external view returns (string memory) {
        bytes32 h = users[user].usernameHash;
        return h == bytes32(0) ? "" : usernameHashToString[h];
    }

    function getAddressByUsername(string memory name) external view returns (address) {
        return usernameHashToAddress[keccak256(bytes(name))];
    }

    function totalUsers() external view returns (uint256) {
        return allUsers.length;
    }

    /** 分页读取（建议每页 ≤ 100） */
    function getUsersPaginated(uint256 start, uint256 limit)
        external view returns (
            address[] memory addrs,
            string[] memory names,
            uint256[] memory times
        )
    {
        if (start >= allUsers.length) return (new address[](0), new string[](0), new uint256[](0));
        uint256 end = start + limit;
        if (end > allUsers.length) end = allUsers.length;

        addrs = new address[](end - start);
        names = new string[](end - start);
        times = new uint256[](end - start);

        for (uint256 i = start; i < end; i++) {
            address u = allUsers[i];
            bytes32 h = users[u].usernameHash;
            addrs[i - start] = u;
            names[i - start] = usernameHashToString[h];
            times[i - start] = users[u].registrationTime;
        }
    }

    // ============== 用户操作 ==============
    function registerUsername(string memory username) external payable {
        require(msg.value >= registrationFee, "fee low");
        require(users[msg.sender].registrationTime == 0, "already reg");

        bytes32 hash = _validate(username);
        users[msg.sender] = UserProfile(hash, block.timestamp);
        usernameHashToAddress[hash] = msg.sender;
        usernameHashToString[hash] = username;
        allUsers.push(msg.sender);

        _executeAirdrop(msg.value);

        emit UsernameRegistered(msg.sender, username, msg.value);
    }

    function modifyUsername(string memory newUsername) external payable {
        require(users[msg.sender].registrationTime != 0, "not reg");
        require(msg.value >= modificationFee, "fee low");

        string memory oldName = usernameHashToString[users[msg.sender].usernameHash];
        bytes32 oldHash = users[msg.sender].usernameHash;

        bytes32 newHash = _validate(newUsername);

        // 清理旧记录
        delete usernameHashToAddress[oldHash];
        delete usernameHashToString[oldHash];

        // 写入新记录
        users[msg.sender].usernameHash = newHash;
        usernameHashToAddress[newHash] = msg.sender;
        usernameHashToString[newHash] = newUsername;

        _executeAirdrop(msg.value);

        emit UsernameModified(msg.sender, oldName, newUsername, msg.value);
    }

    // ============== 内部工具 ==============
    function _validate(string memory name) internal view returns (bytes32) {
        bytes memory b = bytes(name);
        require(b.length >= MIN_USERNAME_LENGTH && b.length <= MAX_USERNAME_LENGTH, "len");
        bytes32 h = keccak256(b);
        require(usernameHashToAddress[h] == address(0), "taken");
        return h;
    }

    /** 每次付费操作都可领取当前周期全部已线性释放的 CT */
    function _executeAirdrop(uint256 ai3Paid) internal {
        if (block.timestamp >= cycleEndTime || cycleTotalCT == 0) return;

        uint256 elapsed = block.timestamp - lastAirdropTS;
        if (elapsed == 0) return;

        uint256 shouldRelease = elapsed * cycleTotalCT / AIRDROP_CYCLE_DURATION;
        uint256 remaining = cycleTotalCT - distributedCT;
        if (shouldRelease > remaining) shouldRelease = remaining;

        if (shouldRelease == 0) return;

        uint256 bal = ctToken.balanceOf(address(this));
        if (shouldRelease > bal) shouldRelease = bal;

        ctToken.transfer(msg.sender, shouldRelease);
        distributedCT += shouldRelease;
        lastAirdropTS = block.timestamp;

        emit AirdropExecuted(msg.sender, ai3Paid, shouldRelease);
    }
}