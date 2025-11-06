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
        uint256 commentFee;
    }

    mapping(address => UserProfile) public users;
    mapping(bytes32 => address) public usernameHashToAddress;
    mapping(bytes32 => string) public usernameHashToString;
    address[] public allUsers;

    // ============== 代币 & 费用 ==============
    ConnectionToken public immutable ctToken;
    uint256 public registrationFee;
    uint256 public modificationFee;
    uint256 public defaultCommentFee;
    uint256 public defaultTipAmount;
    address public feeReceiver;                     // 可随时更改

    // ============== 线性空投（4 年周期） ==============
    struct AirdropCycle {
        uint256 cycleStartTime;
        uint256 cycleEndTime;
        uint256 cycleTotalCT;
        uint256 distributedCT;
        uint256 lastAirdropTS;
    }
    enum AirdropPool { User, Content, Tip }
    uint256 public constant AIRDROP_CYCLE_DURATION = 126144000; // ~4 years
    mapping(AirdropPool => AirdropCycle) public airdropCycles;

    // ============== 用户名长度 ==============
    uint256 public constant MIN_USERNAME_LENGTH = 3;
    uint256 public constant MAX_USERNAME_LENGTH = 32;

    // ============== 消息结构 ==============
    struct Message {
        uint256 id;
        address author;
        string content;
        uint256 timestamp;
        uint256 likes;
    }

    struct Comment {
        uint256 id;
        address author;
        string content;
        uint256 timestamp;
        uint256 likes;
        uint256 messageId;
        uint256 parentCommentId; // 0 for a direct comment on a message
    }

    // ============== 消息存储 ==============
    Message[] public allMessages;
    Comment[] public allComments;
    mapping(address => uint256[]) public userMessages; // 用户发布的消息ID列表
    mapping(uint256 => uint256[]) public messageComments; // messageId => top-level commentIds
    mapping(uint256 => uint256[]) public commentReplies; // commentId => reply commentIds
    // 跟踪点赞情况，防止重复点赞: messageId => userAddress => hasLiked
    mapping(uint256 => mapping(address => bool)) public userLikes; 
    // commentId => userAddress => hasLiked
    mapping(uint256 => mapping(address => bool)) public userCommentLikes;


    // ============== 事件 ==============
    event UsernameRegistered(address indexed user, string username, uint256 fee);
    event UsernameModified(address indexed user, string oldName, string newName, uint256 fee);
    event AirdropCycleStarted(AirdropPool pool, uint256 start, uint256 end, uint256 totalCT);
    event UserCommentFeeSet(address indexed user, uint256 newFee);
    event AirdropExecuted(address indexed user, uint256 ai3Paid, uint256 ctAmount);
    event FeeReceiverChanged(address indexed oldAddr, address indexed newAddr);
    event FeeWithdrawn(address indexed receiver, uint256 amount);

    event MessagePosted(uint256 indexed id, address indexed author, string content);
    event CommentPosted(uint256 indexed id, address indexed author, uint256 indexed messageId, uint256 parentId, string content);
    event MessageLiked(uint256 indexed id, address indexed user, uint256 newLikes, uint256 tipAmount);


    // ============== 构造函数 ==============
    constructor(
        address _ctToken,
        uint256 _regFee,
        uint256 _modFee,
        uint256 _defaultCommentFee,
        uint256 _defaultTip
    ) Ownable(msg.sender) {
        ctToken = ConnectionToken(_ctToken);
        registrationFee = _regFee;
        modificationFee = _modFee;
        defaultCommentFee = _defaultCommentFee;
        defaultTipAmount = _defaultTip;
        feeReceiver = msg.sender;
    }

    // ============== Owner 管理 ==============
    function setRegistrationFee(uint256 fee) external onlyOwner { registrationFee = fee; }
    function setModificationFee(uint256 fee) external onlyOwner { modificationFee = fee; }

    function setFeeReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "zero addr");
        emit FeeReceiverChanged(feeReceiver, newReceiver);
        feeReceiver = newReceiver;
    }
    
    function setDefaultCommentFee(uint256 _fee) external onlyOwner {
        defaultCommentFee = _fee;
    }

    function setDefaultTipAmount(uint256 _tip) external onlyOwner {
        defaultTipAmount = _tip;
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
    function startNewAirdropCycle(AirdropPool pool, uint256 totalCT) external onlyOwner {
        require(totalCT > 0, "zero amount");
        require(ctToken.balanceOf(address(this)) >= totalCT, "insufficient CT");
        AirdropCycle storage cycle = airdropCycles[pool];
        cycle.cycleStartTime = block.timestamp;
        cycle.cycleEndTime   = block.timestamp + AIRDROP_CYCLE_DURATION;
        cycle.cycleTotalCT   = totalCT;
        cycle.distributedCT  = 0;
        cycle.lastAirdropTS  = block.timestamp;

        emit AirdropCycleStarted(pool, cycle.cycleStartTime, cycle.cycleEndTime, totalCT);
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

    /**
     * @dev 内部函数，计算当前可领取的空投数量
     * @return amount 可领取的 CT 数量
     */
    function _getAirdropAmount(AirdropPool pool) internal view returns (uint256 amount) {
        AirdropCycle storage cycle = airdropCycles[pool];

        if (block.timestamp >= cycle.cycleEndTime || cycle.cycleTotalCT == 0) {
            return 0;
        }

        uint256 elapsed = block.timestamp - cycle.lastAirdropTS;
        if (elapsed == 0) return 0;

        uint256 shouldRelease = elapsed * cycle.cycleTotalCT / AIRDROP_CYCLE_DURATION;
        uint256 remainingInCycle = cycle.cycleTotalCT - cycle.distributedCT;
        if (shouldRelease > remainingInCycle) {
            shouldRelease = remainingInCycle;
        }

        uint256 contractBalance = ctToken.balanceOf(address(this));
        if (shouldRelease > contractBalance) {
            shouldRelease = contractBalance;
        }

        return shouldRelease;
    }

    /**
     * @dev 计算当前调用可获得的预估空投数量
     * @return amount 预估可领取的 CT 数量
     */
    function getEstimatedAirdrop(AirdropPool pool) external view returns (uint256 amount) {
        return _getAirdropAmount(pool);
    }

    // ============== 用户操作 ==============
    function registerUsername(string memory username) external payable {
        require(msg.value >= registrationFee, "fee low");
        require(users[msg.sender].registrationTime == 0, "already reg");

        bytes32 hash = _validate(username);
        users[msg.sender] = UserProfile(hash, block.timestamp, 0);
        usernameHashToAddress[hash] = msg.sender;
        usernameHashToString[hash] = username;
        allUsers.push(msg.sender);

        _executeAirdrop(AirdropPool.User, msg.value);

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

        _executeAirdrop(AirdropPool.User, msg.value);

        emit UsernameModified(msg.sender, oldName, newUsername, msg.value);
    }

    function setUserCommentFee(uint256 _commentFee) external {
        require(users[msg.sender].registrationTime != 0, "not registered");
        users[msg.sender].commentFee = _commentFee;
        emit UserCommentFeeSet(msg.sender, _commentFee);
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
    function _executeAirdrop(AirdropPool pool, uint256 ai3Paid) internal {
        AirdropCycle storage cycle = airdropCycles[pool];
        uint256 airdropAmount = _getAirdropAmount(pool);

        if (airdropAmount > 0) {
            ctToken.transfer(msg.sender, airdropAmount);
            cycle.distributedCT += airdropAmount;
            cycle.lastAirdropTS = block.timestamp;
            
            emit AirdropExecuted(msg.sender, ai3Paid, airdropAmount);
        }
    }

    // ============== 消息操作 API ==============
    
    /** * @dev 用户发布消息。必须先注册。 
     */
    function postMessage(string memory content) external {
        // 要求用户必须先注册
        require(users[msg.sender].registrationTime != 0, "not registered");
        require(bytes(content).length > 0 && bytes(content).length <= 280, "content length invalid"); // 280字符限制

        uint256 messageId = allMessages.length;
        
        // 创建新消息
        Message memory newMessage = Message({
            id: messageId,
            author: msg.sender,
            content: content,
            timestamp: block.timestamp,
            likes: 0
        });

        allMessages.push(newMessage);
        userMessages[msg.sender].push(messageId);

        // 每发布一条消息，也执行空投（激励内容产出）
        _executeAirdrop(AirdropPool.Content, 0); // 假设消息发布无需费用，但可以触发空投

        emit MessagePosted(messageId, msg.sender, content);
    }
    
    /** * @dev 点赞一条消息。用户不能给自己点赞，也不能重复点赞。
     */
    function likeMessage(uint256 messageId) external payable {
        // 确保消息存在
        require(messageId < allMessages.length, "message not found");
        Message storage likedMessage = allMessages[messageId];
        // 不能给自己点赞
        require(likedMessage.author != msg.sender, "cannot like own message");
        // 不能重复点赞
        require(!userLikes[messageId][msg.sender], "already liked");

        // 更新状态
        userLikes[messageId][msg.sender] = true;
        likedMessage.likes++;

        // 处理可选的小费
        if (msg.value > 0) {
            uint256 authorShare = msg.value * 80 / 100; // 80% to author
            // The remaining 20% is the tax and stays in the contract
            if (authorShare > 0) {
                (bool success, ) = payable(likedMessage.author).call{value: authorShare}("");
                require(success, "tip transfer failed");
            }
        }

        // 如果小费达到或超过默认值，则执行空投
        if (msg.value >= defaultTipAmount) {
            _executeAirdrop(AirdropPool.Tip, msg.value);
        }
        
        emit MessageLiked(messageId, msg.sender, likedMessage.likes, msg.value);
    }

    function commentOnMessage(uint256 messageId, uint256 parentCommentId, string memory content) external payable {
        require(users[msg.sender].registrationTime != 0, "not registered");
        require(messageId < allMessages.length, "message not found");
        require(bytes(content).length > 0 && bytes(content).length <= 280, "content length invalid");

        Message storage originalMessage = allMessages[messageId];
        uint256 userFee = users[originalMessage.author].commentFee;
        uint256 fee = userFee > 0 ? userFee : defaultCommentFee;

        // Fee logic
        if (messageComments[messageId].length == 0 || msg.sender != originalMessage.author) {
            // Non author's first comment on this message, fee is required
            require(msg.value >= fee, "comment fee low");
            if (fee > 0) {
                uint256 authorShare = msg.value * 80 / 100;
                (bool success, ) = payable(originalMessage.author).call{value: authorShare}("");
                require(success, "author share transfer failed");
            }
        } else { // Subsequent comments from the author are free
            require(msg.value == 0, "comment is free");
        }

        if (parentCommentId != 0) {
            require(parentCommentId < allComments.length, "parent comment not found");
            require(allComments[parentCommentId].messageId == messageId, "parent comment mismatch");
        }

        uint256 commentId = allComments.length;
        Comment memory newComment = Comment(commentId, msg.sender, content, block.timestamp, 0, messageId, parentCommentId);
        allComments.push(newComment);

        if (parentCommentId == 0) {
            messageComments[messageId].push(commentId);
        } else {
            commentReplies[parentCommentId].push(commentId);
        }

        // 只有在支付了至少默认评论费时才触发内容空投
        if (msg.value >= defaultCommentFee) {
            _executeAirdrop(AirdropPool.Content, msg.value);
        }

        emit CommentPosted(commentId, msg.sender, messageId, parentCommentId, content);
    }


    // ============== 前端查询 API ==============

    /** @dev 查询消息总数 */
    function messageCount() external view returns (uint256) {
        return allMessages.length;
    }

    /** @dev 获取特定用户的消息ID列表 */
    function getUserMessageIds(address user) external view returns (uint256[] memory) {
        return userMessages[user];
    }
    
    /** @dev 获取单条消息详情 */
    function getMessage(uint256 messageId) external view returns (Message memory) {
        require(messageId < allMessages.length, "message not found");
        return allMessages[messageId];
    }

    /** @dev 获取单条评论详情 */
    function getComment(uint256 commentId) external view returns (Comment memory) {
        require(commentId < allComments.length, "comment not found");
        return allComments[commentId];
    }
    
    /** @dev 检查用户是否点赞了某条消息 */
    function hasLiked(uint256 messageId, address user) external view returns (bool) {
        return userLikes[messageId][user];
    }
    
    /** * @dev 获取最新 N 条消息 (从后往前查询)
     */
    function getLatestMessages(uint256 count) 
        external view 
        returns (Message[] memory) 
    {
        uint256 total = allMessages.length;
        if (total == 0) return new Message[](0);
        
        uint256 actualCount = count;
        uint256 startIndex;
        
        if (count > total) {
            actualCount = total;
            startIndex = 0;
        } else {
            startIndex = total - count;
        }
        
        Message[] memory messages = new Message[](actualCount);
        for (uint256 i = 0; i < actualCount; i++) {
            messages[i] = allMessages[startIndex + i];
        }
        
        return messages;
    }
    
    /** * @dev 获取最热消息 (需要链下服务辅助排序，这里提供一个简单的全量查询，前端进行排序)
     * 实际生产环境应使用 subgraph 或自定义索引服务。
     */
    function getAllMessageIds() external view returns (uint256) {
        // 🚨 警告：全量数据传输Gas成本高，生产环境应避免。这里仅为Demo提供。
        return allMessages.length;
    }

}